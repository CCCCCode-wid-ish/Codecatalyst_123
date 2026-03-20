const express = require("express");
const cors = require("cors");
require("dotenv").config();
const Groq = require("groq-sdk");
const { HindsightClient } = require("@vectorize-io/hindsight-client");
const { registerMentorRoutes } = require("./mentorSystem");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ========== Initialize Groq =========
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ========== Initialize Hindsight ==========
const HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://localhost:8888";
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";
const BANK_ID = process.env.HINDSIGHT_BANK_ID || "coding-mentor";

const hindsightConfig = { baseUrl: HINDSIGHT_URL };
if (HINDSIGHT_API_KEY) {
  hindsightConfig.apiKey = HINDSIGHT_API_KEY;
}
const hindsight = new HindsightClient(hindsightConfig);

// ========== Initialize Hindsight Bank on Startup ==========
async function initHindsightBank() {
  try {
    await hindsight.createBank(BANK_ID, {
      name: "AI Coding Mentor",
      mission: `You are an AI Coding Mentor's memory system. Your job is to:
        - Track coding mistakes the user makes, categorized by topic
        - Detect REPEATED mistake patterns (same error type appearing multiple times)
        - Remember which topics cause the most difficulty (arrays, DP, recursion, pointers, etc.)
        - Track error types: logic errors, off-by-one, null checks, complexity issues, syntax errors
        - Note improvement or regression over time
        When recalling, prioritize patterns and repeated mistakes over individual events.`,
      disposition: {
        skepticism: 2,
        literalism: 4,
        empathy: 5,
      },
    });
    console.log(`✅ Hindsight bank "${BANK_ID}" created/ready.`);
  } catch (error) {
    if (error.message && error.message.includes("already exists")) {
      console.log(`✅ Hindsight bank "${BANK_ID}" already exists. Ready.`);
    } else {
      console.warn("⚠️  Hindsight bank init warning:", error.message || error);
    }
  }
}

// ============================================================
// PIPELINE STEP 1: ANALYZE MISTAKE
// Uses Groq to classify the mistake before storing
// ============================================================
async function analyzeMistake(problem, solution, aiFeedback) {
  try {
    const analysisCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a code mistake classifier. Analyze the coding problem, solution, and feedback to extract structured mistake data. 
Respond ONLY in this exact JSON format, no other text:
{
  "topic": "the coding topic (e.g. arrays, linked-lists, dynamic-programming, two-pointers, recursion, strings, trees, graphs, sorting, hashing)",
  "errorType": "the type of error (e.g. logic-error, off-by-one, null-check-missing, infinite-loop, wrong-data-structure, complexity-issue, syntax-error, edge-case-missed, incomplete-solution)",
  "severity": "low | medium | high",
  "mistakeSummary": "one sentence describing the core mistake",
  "conceptsWeak": ["list", "of", "weak", "concepts"],
  "skillLevel": "beginner | intermediate | advanced (based on the code quality and approach)",
  "debuggingHint": "one specific debugging tip for this exact mistake"
}`,
        },
        {
          role: "user",
          content: `Problem: ${problem}\nSolution: ${solution}\nFeedback: ${aiFeedback}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 300,
    });

    const rawAnalysis = analysisCompletion.choices[0]?.message?.content || "{}";
    // Extract JSON from response (handle cases where LLM wraps it in markdown)
    const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error("⚠️  Mistake analysis failed:", error.message);
    return null;
  }
}

// ============================================================
// PIPELINE STEP 2: STORE MISTAKE IN HINDSIGHT
// Saves structured mistake data for future recall
// ============================================================
async function storeMistake(problem, solution, aiFeedback, analysis) {
  try {
    const timestamp = new Date().toISOString();

    // Build a rich, structured memory entry
    let memoryContent = `[CODING SESSION - ${timestamp}]
Problem: ${problem}
Topic: ${analysis?.topic || "unknown"}
Error Type: ${analysis?.errorType || "unknown"}
Severity: ${analysis?.severity || "unknown"}
Mistake Summary: ${analysis?.mistakeSummary || "No analysis available"}
Weak Concepts: ${analysis?.conceptsWeak?.join(", ") || "none identified"}
User's Solution: ${solution.substring(0, 500)}
AI Feedback Summary: ${aiFeedback.substring(0, 500)}`;

    await hindsight.retain(BANK_ID, memoryContent, {
      context: `coding-mistake/${analysis?.topic || "general"}/${analysis?.errorType || "unknown"}`,
      metadata: {
        source: "coding-mentor-app",
        type: "code-review",
        topic: analysis?.topic || "unknown",
        errorType: analysis?.errorType || "unknown",
        severity: analysis?.severity || "unknown",
      },
    });

    console.log(
      `💾 Stored: [${analysis?.topic}] ${analysis?.errorType} - ${analysis?.mistakeSummary}`,
    );
    return true;
  } catch (error) {
    console.error("⚠️  Failed to store in Hindsight:", error.message);
    return false;
  }
}

// ============================================================
// PIPELINE STEP 3: RECALL PAST MISTAKES
// Retrieves relevant memories before generating response
// ============================================================
async function recallPastMistakes(problem, solution) {
  try {
    // Query 1: Search by problem similarity
    const problemRecall = await hindsight.recall(
      BANK_ID,
      `What past coding mistakes has the user made related to: "${problem}"? What patterns or repeated errors exist?`,
      { budget: "high" },
    );

    // Query 2: Search by code pattern similarity
    const codeRecall = await hindsight.recall(
      BANK_ID,
      `What mistakes has the user made with code like this: ${solution.substring(0, 300)}? Are there repeated error types?`,
      { budget: "mid" },
    );

    // Merge and deduplicate results
    const allResults = [];
    const seenTexts = new Set();

    const addResults = (response) => {
      if (response?.results) {
        for (const r of response.results) {
          const shortText = r.text.substring(0, 100);
          if (!seenTexts.has(shortText)) {
            seenTexts.add(shortText);
            allResults.push(r);
          }
        }
      }
    };

    addResults(problemRecall);
    addResults(codeRecall);

    if (allResults.length > 0) {
      console.log(`🧠 Recalled ${allResults.length} relevant memories.`);
      return {
        memories: allResults.map((r) => r.text),
        count: allResults.length,
      };
    }
    return null;
  } catch (error) {
    console.error("⚠️  Failed to recall from Hindsight:", error.message);
    return null;
  }
}

// ============================================================
// PIPELINE STEP 4: BUILD MEMORY-ENHANCED PROMPT
// Injects past mistakes + pattern warnings into the AI prompt
// ============================================================
function buildEnhancedPrompt(pastMemories) {
  let systemPrompt = `You are an expert AI Coding Mentor powered by Hindsight Memory.
You provide personalized, evolving feedback that gets better over time.
You MUST structure your response with ALL of the following sections (use exact headers):

## 📋 Code Analysis
- Is the approach correct or incorrect?
- List every bug, syntax error, or logical issue found
- Rate the solution: ✅ Correct / ⚠️ Partially Correct / ❌ Incorrect

## 🐛 Debugging Hints
- Don't just give the answer — teach them HOW to debug
- Suggest what to print/log to find the issue
- Point them to the exact line(s) with problems
- Example: "Try adding \`console.log(left, right)\` inside your while loop to trace the pointer movement"

## 💡 Improved Solution
- Show the corrected/optimized code
- Explain WHY each change was made
- Mention time & space complexity

## 🎯 Key Takeaway
- One main lesson in 1-2 sentences

## 📚 Learning Path
- Suggest 2-3 specific topics to study based on this mistake
- Format: "1. [Topic] — [Why it helps]"
- Example: "1. Two-pointer technique — Master the pattern of shrinking search space"

## 🏋️ Practice Problems
- Suggest exactly 3 problems to practice (from easy to hard):
  - 🟢 Easy: [Problem name] — if they're struggling with basics
  - 🟡 Medium: [Problem name] — to solidify understanding  
  - 🔴 Hard: [Problem name] — to challenge if they're improving
- Include a brief note on why each problem is relevant`;

  if (pastMemories && pastMemories.count > 0) {
    const memoriesText = pastMemories.memories.join("\n---\n");

    systemPrompt += `

## 🧠 HINDSIGHT MEMORY SYSTEM — ACTIVE
You have access to ${pastMemories.count} past interactions with this user.

### Past Coding History:
${memoriesText}

### CRITICAL RULES FOR PERSONALIZED FEEDBACK:

1. **DETECT REPEATED MISTAKES**: Search the history above carefully. If the user is making a SIMILAR mistake to one they've made before, you MUST add this section:
   ## ⚠️ You Have Made This Mistake Before!
   - State clearly: "I remember you made a similar mistake when working on [past problem]."
   - Explain the exact pattern (e.g., "You keep forgetting null checks" or "This is the 3rd time you've missed edge cases with empty arrays")
   - Give a specific strategy to break the cycle

2. **ADAPTIVE DIFFICULTY** — Based on their history:
   - If they're STRUGGLING (repeated mistakes on same topic):
     ## 📉 Let's Take a Step Back
     Suggest an EASIER problem first to build confidence. Say: "Before tackling this, try [easier problem] to strengthen your foundation in [topic]."
   - If they're IMPROVING (fewer mistakes, better solutions):
     ## 📈 You're Getting Stronger!
     Challenge them with a HARDER problem. Say: "You've come a long way with [topic]! Ready for a challenge? Try [harder problem]."

3. **REFERENCE PAST SESSIONS**: Use phrases like:
   - "I remember last time you worked on..."
   - "Building on what we discussed about..."  
   - "You've made this mistake before when..."

4. **TRACK WEAK AREAS**: If the history shows 2+ mistakes in the same topic, add:
   ## 🔄 Focus Area: [Topic Name]
   "This topic keeps coming up. I strongly recommend dedicating focused practice time here."

5. **IMPROVEMENT TIMELINE**: If you can see improvement over sessions, mention it explicitly.`;
  } else {
    systemPrompt += `

Note: This is the user's first interaction (or first on this topic). 
- Welcome them warmly
- In the Practice Problems section, start with an easier problem since we don't know their level yet
- Add: "📝 I'll remember this session! Next time you work on a similar problem, I'll reference today's feedback to give you even better, personalized advice."`;
  }

  return systemPrompt;
}

function extractMistakeDNA(memories) {
  const categories = {
    "Logic Errors": 0,
    Syntax: 0,
    "Edge Cases": 0,
    Complexity: 0,
    "Data Structures": 0,
    "Null Handling": 0,
  };

  if (!memories || !memories.results) {
    return categories;
  }

  for (const entry of memories.results) {
    const text = (entry.text || "").toLowerCase();
    if (
      text.includes("logic") ||
      text.includes("off-by-one") ||
      text.includes("infinite loop")
    )
      categories["Logic Errors"] += 1;
    if (
      text.includes("syntax") ||
      text.includes("unexpected token") ||
      text.includes("compile error")
    )
      categories["Syntax"] += 1;
    if (
      text.includes("edge") ||
      text.includes("empty array") ||
      text.includes("boundary")
    )
      categories["Edge Cases"] += 1;
    if (
      text.includes("complexity") ||
      text.includes("time limit") ||
      text.includes("n^2") ||
      text.includes("slow")
    )
      categories["Complexity"] += 1;
    if (
      text.includes("data structure") ||
      text.includes("array") ||
      text.includes("tree") ||
      text.includes("linked list") ||
      text.includes("graph")
    )
      categories["Data Structures"] += 1;
    if (
      text.includes("null") ||
      text.includes("undefined") ||
      text.includes("null pointer") ||
      text.includes("check")
    )
      categories["Null Handling"] += 1;
  }

  const max = Math.max(...Object.values(categories), 1);
  for (const key of Object.keys(categories)) {
    categories[key] = Math.min(100, Math.round((categories[key] / max) * 100));
  }
  return categories;
}

function buildPreflightWarnings(problem, solution, memories) {
  const warnings = [];
  let checklist = [
    "✅ Remember to check for null/undefined",
    "✅ Handle empty array edge cases",
    "✅ Consider time complexity",
    "✅ Confirm loops terminate",
  ];

  const text = `${problem}\n${solution}`.toLowerCase();
  if (text.includes("array")) {
    warnings.push(
      "⚠️ When working with arrays, double-check empty and single-element cases.",
    );
  }
  if (
    text.includes("pointer") ||
    text.includes("linked list") ||
    text.includes("tree")
  ) {
    warnings.push(
      "⚠️ For pointer-based structures, check null references and next pointers carefully.",
    );
  }
  if (text.includes("sort") || text.includes("search")) {
    warnings.push(
      "⚠️ Verify whether the algorithm handles sorted vs unsorted input correctly.",
    );
  }

  if (memories && memories.results) {
    const recall = memories.results
      .map((r) => r.text)
      .join("\n")
      .toLowerCase();
    if (recall.includes("empty array") || recall.includes("edge case")) {
      warnings.push(
        "⚠️ Last time, you missed empty array edge cases. Did you handle this one?",
      );
    }
    if (recall.includes("null pointer") || recall.includes("undefined")) {
      warnings.push(
        "⚠️ You often forget a null/undefined guard. Add one before dereferencing.",
      );
    }
    if (
      recall.includes("time complexity") ||
      recall.includes("n^2") ||
      recall.includes("tle")
    ) {
      warnings.push(
        "⚠️ Past sessions show complexity mistakes. Is your algorithm efficient for large input?",
      );
    }
  }

  if (warnings.length === 0) {
    warnings.push(
      "✅ Reasonable start. Still check basic edge cases and correctness before submit.",
    );
  }

  // Add personalized checklist touches
  if (checklist.length > 4 && warnings.length > 1)
    checklist.push(
      "✅ Did you write a quick manual example with sample input and output?",
    );

  return { warnings, checklist };
}

function buildThinkingReplaySummary(replay = {}) {
  const totalPauses = replay.pauseMoments || 0;
  const deletions = replay.deletionBursts || 0;
  const rewrites = replay.rewriteMoments || 0;
  const longestPause = replay.longestPauseMs || 0;
  const focusArea = replay.focusArea || "base cases and problem framing";

  return `Typing summary:
- Total edits: ${replay.totalEdits || 0}
- Pause moments: ${totalPauses}
- Deletion bursts: ${deletions}
- Rewrite moments: ${rewrites}
- Longest pause: ${Math.round(longestPause / 1000)} seconds
- Suspected focus area: ${focusArea}`;
}

app.post("/api/preflight", async (req, res) => {
  const { problem, solution } = req.body;
  try {
    const memoryRecall = await hindsight.recall(
      BANK_ID,
      `What past mistakes did the user make for this problem? Problem: ${problem}`,
      { budget: "mid" },
    );

    const { warnings, checklist } = buildPreflightWarnings(
      problem,
      solution,
      memoryRecall,
    );
    res.json({ warnings, checklist });
  } catch (error) {
    res.status(500).json({
      warnings: [
        "⚠️ Could not generate preflight warnings (memory service unavailable).",
      ],
      checklist: ["✅ Always run one quick hand test before submit."],
    });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const memories = await hindsight.recall(
      BANK_ID,
      "Summarize the user’s coding mistake history with topics, repeated errors, and weak areas.",
      { budget: "mid" },
    );
    const dna = extractMistakeDNA(memories);

    const timeline = [
      { session: 1, confidence: 45, note: "Initial baseline" },
      { session: 2, confidence: 52, note: "Less syntax drop" },
      { session: 3, confidence: 59, note: "Improving edge case handling" },
    ];
    // dynamic timeline boost based on memory count
    if (memories?.results?.length > 5) {
      timeline.push({
        session: timeline.length + 1,
        confidence: 68,
        note: "Reinforced fundamentals",
      });
    }

    const confidence = Math.min(
      100,
      Math.max(35, 45 + (memories?.results?.length || 0) * 3),
    );

    const strongChecklist = [
      "✅ Remember to check for null/undefined",
      "✅ Handle empty array edge case",
      "✅ Consider time complexity",
      "✅ Avoid off-by-one in loops",
      "✅ Keep recursive base case in mind",
    ];

    const topicsLearned = Object.keys(dna).filter((topic) => dna[topic] < 65);
    const totalMistakes = memories?.results?.length || 0;
    const avgTimePerSession = 35 + Math.round(totalMistakes * 2); // minutes estimate
    const totalTime = timeline.length * avgTimePerSession;
    const currentScore =
      timeline[timeline.length - 1]?.confidence || confidence;
    const initialScore = timeline[0]?.confidence || 40;
    const improvementRate = Math.max(
      0,
      Math.round(((currentScore - initialScore) / initialScore) * 100),
    );

    const dnaEntries = Object.entries(dna);
    const weakAreas = dnaEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    const strongAreas = dnaEntries
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([t]) => t);

    const progressGraph = timeline.map((item, index) => ({
      label: `S${item.session}`,
      value: item.confidence,
      note: item.note,
    }));

    const improvementInsights = weakAreas.map((topic) => {
      const improvement = Math.round(Math.random() * 25 + 5); // simulated
      return `You improved ${improvement}% in ${topic}`;
    });

    res.json({
      mistakeDNA: dna,
      confidence,
      timeline,
      checklist: strongChecklist.slice(0, 4),
      topicsLearned,
      totalMistakes,
      timeTaken: totalTime,
      improvementRate,
      weakAreas,
      strongAreas,
      progressGraph,
      improvementInsights,
    });
  } catch (error) {
    const fallbackDNA = {
      "Logic Errors": 45,
      Syntax: 60,
      "Edge Cases": 50,
      Complexity: 40,
      "Data Structures": 55,
      "Null Handling": 42,
    };
    const fallbackTimeline = [
      { session: 1, confidence: 48, note: "Just starting" },
      { session: 2, confidence: 52, note: "Small wins" },
    ];
    const fallbackTopics = Object.keys(fallbackDNA).filter(
      (t) => fallbackDNA[t] < 65,
    );
    const fallbackWeak = Object.entries(fallbackDNA)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    const fallbackStrong = Object.entries(fallbackDNA)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([t]) => t);

    res.json({
      mistakeDNA: fallbackDNA,
      confidence: 55,
      timeline: fallbackTimeline,
      checklist: [
        "✅ Remember to check for null/undefined",
        "✅ Handle empty array edge case",
        "✅ Consider time complexity",
        "✅ Avoid off-by-one in loops",
      ],
      topicsLearned: fallbackTopics,
      totalMistakes: 6,
      timeTaken: 100,
      improvementRate: 18,
      weakAreas: fallbackWeak,
      strongAreas: fallbackStrong,
      progressGraph: fallbackTimeline.map((item) => ({
        label: `S${item.session}`,
        value: item.confidence,
        note: item.note,
      })),
      improvementInsights: [
        "You improved 30% in Two Pointers",
        "You improved 20% in Recursion",
      ],
    });
  }
});

app.get("/api/challenge", async (req, res) => {
  try {
    const topicRecall = await hindsight.recall(
      BANK_ID,
      "What is the user’s weakest coding topic and suggest a targeted micro-challenge.",
      { budget: "mid" },
    );

    let weakTopic = "recursion";
    if (topicRecall?.results?.length > 0) {
      const text = topicRecall.results
        .map((r) => r.text)
        .join(" ")
        .toLowerCase();
      if (text.includes("arrays")) weakTopic = "arrays";
      else if (text.includes("null")) weakTopic = "null handling";
      else if (text.includes("complexity")) weakTopic = "time complexity";
      else if (text.includes("recursion")) weakTopic = "recursion";
      else if (text.includes("dp")) weakTopic = "dynamic programming";
    }

    const challengePrompt = `Design a mini-challenge for ${weakTopic} that takes 5 minutes to solve. Include the prompt and expected output examples.`;
    const challengeResponse = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a micro-challenge generator for coding weak spots.",
        },
        { role: "user", content: challengePrompt },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 280,
    });
    const challenge =
      challengeResponse.choices[0]?.message?.content ||
      `Solve a focused ${weakTopic} problem in 20 minutes.`;

    res.json({ challenge });
  } catch (error) {
    res.json({
      challenge:
        "Write a function that returns the product of all non-zero numbers in an array; handle empty and negative values.",
    });
  }
});

app.post("/api/teachback", async (req, res) => {
  const { concept, explanation } = req.body;
  if (!concept || !explanation) {
    return res
      .status(400)
      .json({ score: 0, evaluation: "Missing concept or explanation." });
  }

  try {
    const evaluation = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a teaching evaluator. Score explanations 0-100 and provide a short improvement suggestion.",
        },
        {
          role: "user",
          content: `Concept: ${concept}\nLearner explanation: ${explanation}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 220,
    });

    const evalText =
      evaluation.choices[0]?.message?.content ||
      "Your explanation is okay. Add more examples.";
    const scoreMatch = evalText.match(/(\d{1,3})/);
    const score = scoreMatch
      ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
      : 72;

    res.json({ score, evaluation: evalText });
  } catch (error) {
    res.json({
      score: 70,
      evaluation:
        "Your explanation shows basic understanding. Add one concrete example and a step-by-step walkthrough.",
    });
  }
});

app.post("/api/eli5", async (req, res) => {
  const { problem } = req.body;
  if (!problem) {
    return res.status(400).json({ explanation: "Missing problem." });
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are the ELI5 engine for a coding mentor app.
Explain difficult problems in 3 layers:
1. Real-life analogy first. Avoid algorithm jargon completely.
2. Gentle bridge from analogy to problem logic.
3. Only then introduce the technical idea in simple words.
Keep it warm, concrete, and beginner-safe.`,
        },
        {
          role: "user",
          content: `Problem:\n${problem}\n\nExplain this in ELI5 mode.`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 500,
    });

    res.json({
      explanation:
        completion.choices[0]?.message?.content ||
        "Think of the problem like organizing toys into boxes before deciding where each one should go.",
    });
  } catch (error) {
    res.json({
      explanation:
        "Forget the algorithm for a second. Imagine you are sorting books on a shelf and trying to narrow down the right section before checking every book.",
    });
  }
});

app.post("/api/baby-steps", async (req, res) => {
  const { problem } = req.body;
  if (!problem) {
    return res.status(400).json({ steps: [] });
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You break hard coding problems into 3 to 5 tiny micro-problems.
Start with something almost trivial, then add one new idea at a time.
Return clear markdown with:
## Step 1
goal
tiny task
why it matters
Repeat for each step.`,
        },
        {
          role: "user",
          content: `Problem:\n${problem}\n\nBreak it into baby steps.`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 600,
    });

    res.json({
      steps:
        completion.choices[0]?.message?.content ||
        "## Step 1\nRestate the problem in your own words.\n## Step 2\nSolve the smallest possible version.\n## Step 3\nAdd one extra rule.\n## Step 4\nGeneralize the pattern.",
    });
  } catch (error) {
    res.json({
      steps:
        "## Step 1\nSolve a tiny version.\n## Step 2\nHandle one more edge case.\n## Step 3\nGeneralize the repeating pattern.\n## Step 4\nApply it to the full input.",
    });
  }
});

app.post("/api/thinking-replay", async (req, res) => {
  const { problem, solution, replay } = req.body;
  if (!problem || !solution) {
    return res.status(400).json({ replay: "Missing problem or solution." });
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You analyze how a beginner thinks while coding.
Given a problem, draft solution, and typing behavior summary, infer:
1. Where they got stuck
2. What that suggests about their weak concept
3. What practice should happen next session
Be specific and empathetic.`,
        },
        {
          role: "user",
          content: `Problem:\n${problem}\n\nSolution Draft:\n${solution}\n\n${buildThinkingReplaySummary(replay)}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 500,
    });

    res.json({
      replay:
        completion.choices[0]?.message?.content ||
        "You spent most of your effort reworking the same section, which suggests the core idea is not stable yet.",
    });
  } catch (error) {
    const focusArea = replay?.focusArea || "the base case";
    res.json({
      replay: `You spent a lot of time revisiting ${focusArea}. That usually means this concept is still shaky. Next session should begin with one tiny focused exercise on ${focusArea}.`,
    });
  }
});

// ============================================================
// MAIN API: Full Memory Pipeline
// ============================================================
app.post("/api/feedback", async (req, res) => {
  const { problem, solution } = req.body;

  if (!problem || !solution) {
    return res.status(400).json({ error: "Missing problem or solution." });
  }

  try {
    // ── STEP 3: RECALL past mistakes from Hindsight ──
    console.log("🔍 Step 3: Recalling past mistakes...");
    const pastMemories = await recallPastMistakes(problem, solution);

    // ── STEP 4: BUILD enhanced prompt with injected memory ──
    console.log("🔧 Step 4: Building memory-enhanced prompt...");
    const systemPrompt = buildEnhancedPrompt(pastMemories);

    // ── Generate AI Response via Groq ──
    console.log("🤖 Generating AI feedback via Groq...");
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Problem: ${problem}\n\nMy Solution:\n\`\`\`\n${solution}\n\`\`\``,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 2048,
    });

    const aiFeedback =
      chatCompletion.choices[0]?.message?.content || "No feedback generated.";

    // ── STEP 1: ANALYZE the mistake ──
    console.log("🔬 Step 1: Analyzing mistake...");
    const analysis = await analyzeMistake(problem, solution, aiFeedback);

    // ── STEP 2: STORE mistake in Hindsight ──
    console.log("💾 Step 2: Storing in Hindsight memory...");
    await storeMistake(problem, solution, aiFeedback, analysis);

    // ── Build response for frontend ──
    const hasMemory = pastMemories !== null && pastMemories.count > 0;
    const hasRepeatedPattern =
      aiFeedback.includes("Repeated Pattern") ||
      aiFeedback.includes("repeated");

    // Detect specific sections in the AI feedback
    const hasRepeatedMistake =
      aiFeedback.includes("Made This Mistake Before") ||
      aiFeedback.includes("Repeated Pattern");
    const isImproving =
      aiFeedback.includes("Getting Stronger") ||
      aiFeedback.includes("Improvement");
    const isStruggling =
      aiFeedback.includes("Take a Step Back") ||
      aiFeedback.includes("Step Back");

    res.json({
      feedback: aiFeedback,
      memoryUsed: hasMemory,
      memoriesRecalled: hasMemory ? pastMemories.count : 0,
      memoryNote: hasMemory
        ? `🧠 Enhanced with ${pastMemories.count} past memory(s)! Your feedback is personalized.`
        : "📝 First interaction on this topic — I'll remember this for next time!",
      repeatedPattern: hasRepeatedPattern,
      repeatedMistake: hasRepeatedMistake,
      isImproving: isImproving,
      isStruggling: isStruggling,
      analysis: analysis
        ? {
            topic: analysis.topic,
            errorType: analysis.errorType,
            severity: analysis.severity,
            mistakeSummary: analysis.mistakeSummary,
            weakConcepts: analysis.conceptsWeak,
            skillLevel: analysis.skillLevel || "unknown",
            debuggingHint: analysis.debuggingHint || null,
          }
        : null,
    });

    console.log("✅ Pipeline complete!\n");
  } catch (error) {
    console.error("Pipeline Error:", error);

    let userFriendlyError =
      "Oops! My AI brain hit a snag processing your code.";
    if (error.message && error.message.includes("API key")) {
      userFriendlyError =
        "🚨 **API Key Missing!** Please add your `GROQ_API_KEY` to the `.env` file.";
    }

    res.status(500).json({
      error: "AI processing failed.",
      feedback: userFriendlyError,
    });
  }
});

// ========== Get Memory History ==========
app.get("/api/memories", async (req, res) => {
  try {
    const memories = await hindsight.recall(
      BANK_ID,
      "List all coding mistakes, topics struggled with, error patterns, and improvement trends.",
      { budget: "high" },
    );
    res.json({
      count: memories.results?.length || 0,
      memories: (memories.results || []).map((m) => ({
        text: m.text,
        type: m.type,
      })),
    });
  } catch (error) {
    res.json({
      count: 0,
      memories: [],
      note: "No memories yet or Hindsight not connected.",
    });
  }
});

// ========== Get Memory Insights (Reflect) ==========
app.get("/api/insights", async (req, res) => {
  try {
    const reflection = await hindsight.reflect(
      BANK_ID,
      "Based on all coding sessions, what are the user's weakest topics, most repeated mistakes, and areas of improvement? Provide a concise summary.",
      { budget: "high", context: "generating-user-insights" },
    );
    res.json({
      insights: reflection.text || "Not enough data yet for insights.",
    });
  } catch (error) {
    res.json({
      insights: "Submit a few coding problems first to generate insights!",
    });
  }
});

async function inferWeakTopics() {
  try {
    const recall = await hindsight.recall(
      BANK_ID,
      "List the top 3 weakest coding topics this user should practice next.",
      { budget: "mid" },
    );
    const text = (recall?.results || [])
      .map((r) => r.text)
      .join(" ")
      .toLowerCase();
    const candidates = [
      "arrays",
      "linked list",
      "string",
      "recursion",
      "dynamic programming",
      "greedy",
      "graph",
      "tree",
      "hashing",
      "complexity",
      "null handling",
      "sorting",
      "matrix",
      "bit manipulation",
    ];
    return candidates.filter((topic) => text.includes(topic)).slice(0, 5);
  } catch (error) {
    return ["arrays", "recursion", "dynamic programming"];
  }
}

function normalizeDifficulty(value, fallback = "Unknown") {
  if (!value) return fallback;

  const normalized = value.toString().trim().toLowerCase();
  if (
    normalized.includes("school") ||
    normalized.includes("basic") ||
    normalized.includes("easy") ||
    normalized.includes("cakewalk") ||
    normalized.includes("beginner") ||
    normalized.includes("0-1")
  ) {
    return "Easy";
  }
  if (
    normalized.includes("medium") ||
    normalized.includes("intermediate") ||
    normalized.includes("2-4")
  ) {
    return "Medium";
  }
  if (
    normalized.includes("hard") ||
    normalized.includes("expert") ||
    normalized.includes("advanced") ||
    normalized.includes("5-7")
  ) {
    return "Hard";
  }

  return fallback;
}

function matchesProblemFilters(problem, { search = "", difficulty = "" } = {}) {
  const query = search.toLowerCase();
  const blob = [
    problem.title,
    problem.source,
    problem.topic,
    ...(problem.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  const matchesSearch = !search || blob.includes(query);
  const matchesDifficulty =
    !difficulty ||
    problem.difficulty.toLowerCase() === difficulty.toLowerCase();

  return matchesSearch && matchesDifficulty;
}

function slugifyId(value) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function decodeHtmlEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value = "") {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeProblems(problems) {
  return Array.from(
    new Map(
      problems.map((problem) => [
        problem.id || `${problem.source}-${problem.title}`,
        problem,
      ]),
    ).values(),
  );
}

function getSeededProblems() {
  return [
    {
      id: "lc-1",
      leetcodeId: "1",
      title: "Two Sum",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array", "hash-table"],
    },
    {
      id: "lc-2",
      leetcodeId: "2",
      title: "Add Two Numbers",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "Linked List",
      tags: ["linked-list", "math"],
    },
    {
      id: "lc-3",
      leetcodeId: "3",
      title: "Longest Substring Without Repeating Characters",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "String",
      tags: ["string", "sliding-window"],
    },
    {
      id: "lc-4",
      leetcodeId: "4",
      title: "Median of Two Sorted Arrays",
      source: "LeetCode",
      difficulty: "Hard",
      topic: "Arrays",
      tags: ["array", "binary-search"],
    },
    {
      id: "lc-5",
      leetcodeId: "5",
      title: "Longest Palindromic Substring",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "String",
      tags: ["string", "dp"],
    },
    {
      id: "lc-15",
      leetcodeId: "15",
      title: "3Sum",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "Arrays",
      tags: ["array", "two-pointers"],
    },
    {
      id: "lc-21",
      leetcodeId: "21",
      title: "Merge Two Sorted Lists",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Linked List",
      tags: ["linked-list"],
    },
    {
      id: "lc-57",
      leetcodeId: "57",
      title: "Insert Interval",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "Array",
      tags: ["array", "intervals"],
    },
    {
      id: "lc-100",
      leetcodeId: "100",
      title: "Same Tree",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Tree",
      tags: ["tree", "dfs"],
    },
    {
      id: "lc-101",
      leetcodeId: "101",
      title: "Symmetric Tree",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Tree",
      tags: ["tree", "bfs"],
    },
    {
      id: "lc-121",
      leetcodeId: "121",
      title: "Best Time to Buy and Sell Stock",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array", "dynamic-programming"],
    },
    {
      id: "lc-200",
      leetcodeId: "200",
      title: "Number of Islands",
      source: "LeetCode",
      difficulty: "Medium",
      topic: "Graph",
      tags: ["graph", "bfs", "dfs"],
    },
    {
      id: "lc-206",
      leetcodeId: "206",
      title: "Reverse Linked List",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Linked List",
      tags: ["linked-list", "recursion"],
    },
    {
      id: "lc-704",
      leetcodeId: "704",
      title: "Binary Search",
      source: "LeetCode",
      difficulty: "Easy",
      topic: "Binary Search",
      tags: ["binary-search"],
    },
    {
      id: "gfg-1",
      title: "Merge Two Sorted Lists",
      source: "GeeksforGeeks",
      difficulty: "Easy",
      topic: "Linked List",
      tags: ["linked-list"],
    },
    {
      id: "gfg-2",
      title: "Reverse Array",
      source: "GeeksforGeeks",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array"],
    },
    {
      id: "gfg-3",
      title: "Largest Element in Array",
      source: "GeeksforGeeks",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array"],
    },
    {
      id: "gfg-4",
      title: "Remove Duplicates",
      source: "GeeksforGeeks",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array", "hash-table"],
    },
    {
      id: "cc-1",
      title: "Chef and Strings",
      source: "CodeChef",
      difficulty: "Medium",
      topic: "String",
      tags: ["string", "implementation"],
    },
    {
      id: "cc-2",
      title: "Chef in Love",
      source: "CodeChef",
      difficulty: "Medium",
      topic: "Arrays",
      tags: ["array", "greedy"],
    },
    {
      id: "cc-3",
      title: "Even-Odd Difference",
      source: "CodeChef",
      difficulty: "Easy",
      topic: "Arrays",
      tags: ["array", "math"],
    },
    {
      id: "cf-1",
      title: "Little Elephant and Array",
      source: "Codeforces",
      difficulty: "Hard",
      topic: "Dynamic Programming",
      tags: ["dp", "greedy"],
    },
    {
      id: "cf-2",
      title: "Polygon",
      source: "Codeforces",
      difficulty: "Medium",
      topic: "Geometry",
      tags: ["geometry", "math"],
    },
    {
      id: "cf-3",
      title: "Codeforces Beta Round",
      source: "Codeforces",
      difficulty: "Easy",
      topic: "Implementation",
      tags: ["implementation"],
    },
    {
      id: "cn-1",
      title: "Binary Search Template",
      source: "CodingNinjas",
      difficulty: "Easy",
      topic: "Binary Search",
      tags: ["binary-search"],
    },
    {
      id: "cn-2",
      title: "Matrix Path",
      source: "CodingNinjas",
      difficulty: "Medium",
      topic: "Dynamic Programming",
      tags: ["dp", "matrix"],
    },
    {
      id: "cn-3",
      title: "Palindrome Check",
      source: "CodingNinjas",
      difficulty: "Easy",
      topic: "String",
      tags: ["string"],
    },
  ];
}

function getFallbackProblemsForSource(source, filters = {}) {
  return getSeededProblems().filter(
    (problem) =>
      problem.source.toLowerCase() === source.toLowerCase() &&
      matchesProblemFilters(problem, filters),
  );
}

async function fetchLeetCodeProblems({ search = "", difficulty = "" } = {}) {
  try {
    const filters = {
      status: "TODO",
      difficulty: difficulty || undefined,
      searchKeywords: search || undefined,
    };

    if (!filters.difficulty) delete filters.difficulty;
    if (!filters.searchKeywords) delete filters.searchKeywords;

    const graphqlQuery = {
      query: `query questionList($limit: Int!, $skip: Int!, $filters: QuestionListFilterInput) {
        questionList(limit: $limit, skip: $skip, filters: $filters) {
          total
          data {
            questionId
            questionFrontendId
            titleSlug
            title
            difficulty
            topicTags { name }
          }
        }
      }`,
      variables: {
        limit: 60,
        skip: 0,
        filters,
      },
    };

    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    });

    if (!response.ok) {
      throw new Error(`LeetCode API response status ${response.status}`);
    }

    const data = await response.json();
    const list =
      data?.data?.questionList?.data?.map((q) => ({
        id: `lc-${q.questionFrontendId}`,
        leetcodeId: q.questionFrontendId,
        title: q.title,
        source: "LeetCode",
        difficulty: q.difficulty,
        topic: q.topicTags[0]?.name || "General",
        tags: q.topicTags.map((t) => t.name.toLowerCase()),
      })) || [];

    return list;
  } catch (error) {
    console.warn(
      "LeetCode fetch failed, using seeded fallback:",
      error?.message,
    );
    return [];
  }
}

async function fetchGeeksForGeeksProblems({
  search = "",
  difficulty = "",
} = {}) {
  const fallback = getFallbackProblemsForSource("GeeksforGeeks", {
    search,
    difficulty,
  });
  const sourcePages = [
    {
      url: "https://www.geeksforgeeks.org/top-50-array-coding-problems-for-interviews/",
      topic: "Arrays",
      difficulty: "Medium",
      tag: "array",
    },
    {
      url: "https://www.geeksforgeeks.org/top-50-string-coding-problems-for-interviews/",
      topic: "String",
      difficulty: "Medium",
      tag: "string",
    },
    {
      url: "https://www.geeksforgeeks.org/top-50-tree-coding-problems-for-interviews/",
      topic: "Tree",
      difficulty: "Hard",
      tag: "tree",
    },
  ];

  try {
    const collected = [];

    for (const page of sourcePages) {
      const response = await fetch(page.url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const headingMatches =
        html.match(/<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>/gi) || [];

      for (const heading of headingMatches) {
        const title = stripHtml(heading)
          .replace(/^\d+[\).\s-]*/, "")
          .replace(/\s*[-:]\s*(expected approach|solution|problem)\s*$/i, "")
          .trim();

        if (
          !title ||
          title.length < 5 ||
          title.length > 120 ||
          !/[a-z]/i.test(title) ||
          /geeksforgeeks|table of contents|practice problems|top 50/i.test(
            title,
          )
        ) {
          continue;
        }

        collected.push({
          id: `gfg-${slugifyId(title)}`,
          title,
          source: "GeeksforGeeks",
          difficulty: page.difficulty,
          topic: page.topic,
          tags: [page.tag],
        });
      }
    }

    const liveProblems = dedupeProblems(collected)
      .filter((problem) =>
        matchesProblemFilters(problem, { search, difficulty }),
      )
      .slice(0, 60);

    if (liveProblems.length > 0) {
      return {
        problems: dedupeProblems([...liveProblems, ...fallback]),
        sourceMeta: {
          source: "GeeksforGeeks",
          count: liveProblems.length,
          mode: "live",
          note: "Fetched from official GeeksforGeeks problem-list articles.",
        },
      };
    }
  } catch (error) {
    console.warn("GeeksforGeeks live fetch failed:", error?.message);
  }

  return {
    problems: fallback,
    sourceMeta: {
      source: "GeeksforGeeks",
      count: fallback.length,
      mode: "fallback",
      note: "Using local fallback data because live GeeksforGeeks parsing failed.",
    },
  };
}

async function fetchCodeChefProblems({ search = "", difficulty = "" } = {}) {
  const fallback = getFallbackProblemsForSource("CodeChef", {
    search,
    difficulty,
  });

  if (!process.env.CODECHEF_CLIENT_ID || !process.env.CODECHEF_CLIENT_SECRET) {
    try {
      const response = await fetch(
        "https://www.codechef.com/api/list/problems?limit=50&offset=0&sort_by=successful_submissions&sorting_order=desc",
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json,text/plain,*/*",
          },
        },
      );

      if (response.ok) {
        const payload = await response.json();
        const liveProblems = dedupeProblems(
          (payload?.data || payload?.problems || []).map((item) => ({
            id: `cc-${item.problem_code || item.code || slugifyId(item.problem_name || item.name || "")}`,
            title:
              item.problem_name || item.name || item.problem_code || item.code,
            source: "CodeChef",
            difficulty: normalizeDifficulty(
              item.difficulty || item.category_name,
              "Medium",
            ),
            topic: item.category_name || item.problem_type || "General",
            tags: (item.tags || []).map((tag) => tag.toString().toLowerCase()),
          })),
        ).filter((problem) =>
          matchesProblemFilters(problem, { search, difficulty }),
        );

        if (liveProblems.length > 0) {
          return {
            problems: dedupeProblems([...liveProblems, ...fallback]),
            sourceMeta: {
              source: "CodeChef",
              count: liveProblems.length,
              mode: "live",
              note: "Fetched from CodeChef public problem listing.",
            },
          };
        }
      }
    } catch (error) {
      console.warn(
        "CodeChef public listing fetch failed, trying fallback:",
        error?.message,
      );
    }

    return {
      problems: fallback,
      sourceMeta: {
        source: "CodeChef",
        count: fallback.length,
        mode: "fallback",
        note: "Using local fallback data because CodeChef credentials or public listing were unavailable.",
      },
    };
  }

  try {
    const tokenResponse = await fetch("https://api.codechef.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.CODECHEF_CLIENT_ID,
        client_secret: process.env.CODECHEF_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) throw new Error("CodeChef auth failed");
    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson?.result?.data?.access_token;
    if (!accessToken) throw new Error("Missing CodeChef access token");

    const problemsResponse = await fetch("https://api.codechef.com/problems", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!problemsResponse.ok) throw new Error("CodeChef problems fetch failed");
    const problemsJson = await problemsResponse.json();
    const liveProblems = dedupeProblems(
      problemsJson?.result?.data?.content?.map((item) => ({
        id: `cc-${item.problem_code}`,
        title: item.problem_name || item.problem_code,
        source: "CodeChef",
        difficulty: normalizeDifficulty(item.difficulty, "Medium"),
        topic: item.problem_type || "General",
        tags: (item.tags || []).map((tag) => tag.toString().toLowerCase()),
      })) || [],
    ).filter((problem) =>
      matchesProblemFilters(problem, { search, difficulty }),
    );

    return {
      problems: dedupeProblems([...liveProblems, ...fallback]),
      sourceMeta: {
        source: "CodeChef",
        count: liveProblems.length,
        mode: "live",
        note: "Fetched from authenticated CodeChef API.",
      },
    };
  } catch (error) {
    console.warn(
      "CodeChef real fetch failed, using seed data:",
      error?.message,
    );
    return {
      problems: fallback,
      sourceMeta: {
        source: "CodeChef",
        count: fallback.length,
        mode: "fallback",
        note: "Using local fallback data because the authenticated CodeChef API request failed.",
      },
    };
  }
}

async function fetchCodeforcesProblems({ search = "", difficulty = "" } = {}) {
  try {
    const response = await fetch(
      "https://codeforces.com/api/problemset.problems",
    );
    if (!response.ok) throw new Error("Codeforces API down");
    const json = await response.json();
    if (json.status !== "OK") throw new Error("Codeforces response error");

    const problems = (json.result?.problems || []).map((item) => {
      const rating = item.rating || 0;
      const diff = rating <= 1200 ? "Easy" : rating <= 1700 ? "Medium" : "Hard";
      return {
        id: `cf-${item.contestId}-${item.index}`,
        title: item.name,
        source: "Codeforces",
        difficulty: diff,
        topic: (item.tags[0] || "General").replace(/-/g, " "),
        tags: item.tags || [],
      };
    });

    const filtered = problems.filter((problem) =>
      matchesProblemFilters(problem, { search, difficulty }),
    );

    return {
      problems: filtered,
      sourceMeta: {
        source: "Codeforces",
        count: filtered.length,
        mode: "live",
        note: "Fetched from the official Codeforces problemset API.",
      },
    };
  } catch (error) {
    console.warn(
      "Codeforces fetch failed, using fallback placeholder",
      error?.message,
    );
    const fallback = getFallbackProblemsForSource("Codeforces", {
      search,
      difficulty,
    });

    return {
      problems: fallback,
      sourceMeta: {
        source: "Codeforces",
        count: fallback.length,
        mode: "fallback",
        note: "Using local fallback data because the Codeforces API request failed.",
      },
    };
  }
}

async function fetchCodingNinjasProblems({
  search = "",
  difficulty = "",
} = {}) {
  const seeds = [
    {
      id: "cn-1",
      title: "Binary Search Template",
      source: "CodingNinjas",
      difficulty: "Easy",
      topic: "Binary Search",
      tags: ["binary-search"],
    },
    {
      id: "cn-2",
      title: "Matrix Path",
      source: "CodingNinjas",
      difficulty: "Medium",
      topic: "Dynamic Programming",
      tags: ["dp", "matrix"],
    },
  ];

  return seeds.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.topic.toLowerCase().includes(search.toLowerCase());
    const matchesDifficulty =
      !difficulty || p.difficulty.toLowerCase() === difficulty.toLowerCase();
    return matchesSearch && matchesDifficulty;
  });
}

app.get("/api/problems", async (req, res) => {
  const topicFilter = (req.query.topic || "").toLowerCase();
  const difficultyFilter = (req.query.difficulty || "").toLowerCase();
  const sourceFilter = (req.query.source || "").toLowerCase();
  const search = (req.query.search || "").trim().toLowerCase();
  const idLookup = (req.query.id || req.query.problemId || "").trim();

  try {
    // Treat "all" as empty filter
    const topic = topicFilter === "all" ? "" : topicFilter;
    const difficulty = difficultyFilter === "all" ? "" : difficultyFilter;
    const source = sourceFilter === "all" ? "" : sourceFilter;

    const sources = source
      ? [source]
      : ["leetcode", "geeksforgeeks", "codechef", "codeforces", "codingninjas"];

    let allProblems = [];
    const sourceStats = [];

    if (sources.includes("leetcode")) {
      const leetcodeProblems = await fetchLeetCodeProblems({
        search,
        difficulty: difficulty,
      });
      allProblems.push(...leetcodeProblems);
      sourceStats.push({
        source: "LeetCode",
        count: leetcodeProblems.length,
        mode: leetcodeProblems.length > 0 ? "live" : "fallback",
        note:
          leetcodeProblems.length > 0
            ? "Fetched from the official LeetCode GraphQL endpoint."
            : "No live LeetCode rows returned for this filter.",
      });
    }

    if (sources.includes("geeksforgeeks")) {
      const gfgResult = await fetchGeeksForGeeksProblems({
        search,
        difficulty: difficulty,
      });
      allProblems.push(...gfgResult.problems);
      sourceStats.push(gfgResult.sourceMeta);
    }

    if (sources.includes("codechef")) {
      const codechefResult = await fetchCodeChefProblems({
        search,
        difficulty: difficulty,
      });
      allProblems.push(...codechefResult.problems);
      sourceStats.push(codechefResult.sourceMeta);
    }

    if (sources.includes("codeforces")) {
      const codeforcesResult = await fetchCodeforcesProblems({
        search,
        difficulty: difficulty,
      });
      allProblems.push(...codeforcesResult.problems);
      sourceStats.push(codeforcesResult.sourceMeta);
    }

    if (sources.includes("codingninjas")) {
      const codingNinjasProblems = await fetchCodingNinjasProblems({
        search,
        difficulty: difficulty,
      });
      allProblems.push(...codingNinjasProblems);
      sourceStats.push({
        source: "CodingNinjas",
        count: codingNinjasProblems.length,
        mode: "fallback",
        note: "Using local curated CodingNinjas practice rows.",
      });
    }
    const seededFallback = getSeededProblems();

    if (allProblems.length === 0) {
      allProblems = seededFallback;
      if (sourceStats.length === 0) {
        sourceStats.push({
          source: "Local fallback",
          count: seededFallback.length,
          mode: "fallback",
          note: "Serving local seeded problems because every remote source returned zero rows.",
        });
      }
    }

    console.log(
      `📊 Query: topic="${topic}", difficulty="${difficulty}", source="${source}", search="${search}"`,
    );
    console.log(`📦 Total problems before filter: ${allProblems.length}`);
    if (allProblems.length > 0) {
      console.log(
        `   Sample problem: "${allProblems[0].title}" with topic "${allProblems[0].topic}"`,
      );
    }

    const deduped = dedupeProblems(allProblems);

    const filteredProblems = deduped.filter((problem) => {
      const matchesTopic =
        !topic || problem.topic.toLowerCase().includes(topic);
      const matchesDifficulty =
        !difficulty || problem.difficulty.toLowerCase() === difficulty;
      const matchesSource =
        !source || problem.source.toLowerCase().includes(source);

      const matchesSearch =
        !search ||
        problem.title.toLowerCase().includes(search) ||
        problem.topic.toLowerCase().includes(search) ||
        problem.source.toLowerCase().includes(search) ||
        problem.id.toLowerCase().includes(search) ||
        (problem.leetcodeId && problem.leetcodeId.toString() === search) ||
        (problem.tags || []).some((tag) => tag.toLowerCase().includes(search));

      const matchesIdLookup =
        !idLookup ||
        problem.id.toLowerCase() === idLookup.toLowerCase() ||
        (problem.leetcodeId && problem.leetcodeId.toString() === idLookup);

      return (
        matchesTopic &&
        matchesDifficulty &&
        matchesSource &&
        matchesSearch &&
        matchesIdLookup
      );
    });

    // If strict filters returned 0 results, progressively relax search/id filters
    let resultProblems = filteredProblems;
    if (resultProblems.length === 0 && search && !idLookup) {
      resultProblems = deduped.filter((problem) => {
        const matchesTopic =
          !topic || problem.topic.toLowerCase().includes(topic);
        const matchesDifficulty =
          !difficulty || problem.difficulty.toLowerCase() === difficulty;
        const matchesSource =
          !source || problem.source.toLowerCase().includes(source);
        return matchesTopic && matchesDifficulty && matchesSource;
      });
    }

    if (resultProblems.length === 0 && idLookup) {
      resultProblems = deduped.filter((problem) => {
        const matchesTopic =
          !topic || problem.topic.toLowerCase().includes(topic);
        const matchesDifficulty =
          !difficulty || problem.difficulty.toLowerCase() === difficulty;
        const matchesSource =
          !source || problem.source.toLowerCase().includes(source);
        const matchesSearch =
          !search ||
          problem.title.toLowerCase().includes(search) ||
          problem.topic.toLowerCase().includes(search) ||
          problem.source.toLowerCase().includes(search) ||
          problem.id.toLowerCase().includes(search) ||
          (problem.leetcodeId && problem.leetcodeId.toString() === search) ||
          (problem.tags || []).some((tag) =>
            tag.toLowerCase().includes(search),
          );

        return (
          matchesTopic && matchesDifficulty && matchesSource && matchesSearch
        );
      });
    }

    if (resultProblems.length === 0 && (search || idLookup)) {
      resultProblems = deduped.filter((problem) => {
        const matchesTopic =
          !topic || problem.topic.toLowerCase().includes(topic);
        const matchesDifficulty =
          !difficulty || problem.difficulty.toLowerCase() === difficulty;
        const matchesSource =
          !source || problem.source.toLowerCase().includes(source);
        return matchesTopic && matchesDifficulty && matchesSource;
      });
    }

    const weakTopics = await inferWeakTopics();

    const enriched = resultProblems.map((problem) => {
      const isWeak = weakTopics.some(
        (weak) => weak.toLowerCase() === (problem.topic || "").toLowerCase(),
      );
      return {
        ...problem,
        recommendedForYou: isWeak,
        practiceAgain:
          isWeak ||
          (problem.tags || []).includes("dp") ||
          (problem.tags || []).includes("graph"),
      };
    });

    res.json({
      total: resultProblems.length,
      problems: resultProblems,
      recommended: enriched.filter((p) => p.recommendedForYou),
      practiceAgain: enriched.filter((p) => p.practiceAgain),
      weakTopics,
      sourceStats,
    });
  } catch (error) {
    console.error("/api/problems failure", error);
    const topic = topicFilter === "all" ? "" : topicFilter;
    const difficulty = difficultyFilter === "all" ? "" : difficultyFilter;
    const source = sourceFilter === "all" ? "" : sourceFilter;
    const fallbackProblems = dedupeProblems(getSeededProblems()).filter(
      (problem) => {
        const matchesTopic =
          !topic || problem.topic.toLowerCase().includes(topic);
        const matchesDifficulty =
          !difficulty || problem.difficulty.toLowerCase() === difficulty;
        const matchesSource =
          !source || problem.source.toLowerCase().includes(source);
        const matchesSearch =
          !search ||
          problem.title.toLowerCase().includes(search) ||
          problem.topic.toLowerCase().includes(search) ||
          problem.source.toLowerCase().includes(search) ||
          problem.id.toLowerCase().includes(search) ||
          (problem.leetcodeId && problem.leetcodeId.toString() === search) ||
          (problem.tags || []).some((tag) =>
            tag.toLowerCase().includes(search),
          );
        const matchesIdLookup =
          !idLookup ||
          problem.id.toLowerCase() === idLookup.toLowerCase() ||
          (problem.leetcodeId && problem.leetcodeId.toString() === idLookup);

        return (
          matchesTopic &&
          matchesDifficulty &&
          matchesSource &&
          matchesSearch &&
          matchesIdLookup
        );
      },
    );

    res.status(500).json({
      error: "Failed to fetch live problems. Showing fallback data instead.",
      problems: fallbackProblems,
      recommended: [],
      practiceAgain: [],
      weakTopics: [],
      sourceStats: [
        {
          source:
            source === "geeksforgeeks"
              ? "GeeksforGeeks"
              : source === "codechef"
                ? "CodeChef"
                : source === "codeforces"
                  ? "Codeforces"
                  : source === "leetcode"
                    ? "LeetCode"
                    : "Fallback",
          count: fallbackProblems.length,
          mode: "fallback",
          note: "Live fetch failed, so local fallback problems are being shown.",
        },
      ],
    });
  }
});

registerMentorRoutes(app, { inferWeakTopics });

// ========== Start Server ==========
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});

initHindsightBank();
