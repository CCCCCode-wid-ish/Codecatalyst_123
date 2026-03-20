import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

const API = "http://localhost:5000";
const DNA = ["Logic Errors", "Syntax", "Edge Cases", "Complexity", "Data Structures", "Null Handling"];
const userId = (() => {
  const existing = localStorage.getItem("mentorUserId");
  if (existing) return existing;
  const created = `user-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem("mentorUserId", created);
  return created;
})();

function FeedbackSummary({ feedback }) {
  const [expanded, setExpanded] = useState(false);
  const lines = feedback.split("\n").filter((line) => line.trim() !== "");
  const visibleLines = expanded ? lines : lines.slice(0, 5);

  return (
    <div className="feedback-panel">
      <h3>Mentor Feedback</h3>
      {visibleLines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
      {lines.length > 5 && (
        <button className="outline-btn" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

function Login({ authUser, setAuthUser }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: authUser?.name || localStorage.getItem("mentorUserName") || "",
    email: authUser?.email || localStorage.getItem("mentorUserEmail") || "",
    password: "",
  });
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setMessage("Fill in all fields.");
      return;
    }

    const nextUser = {
      id: localStorage.getItem("mentorUserId") || userId,
      name: form.name.trim(),
      email: form.email.trim(),
      loggedInAt: new Date().toISOString(),
    };

    localStorage.setItem("mentorUserName", nextUser.name);
    localStorage.setItem("mentorUserEmail", nextUser.email);
    localStorage.setItem("mentorAuthUser", JSON.stringify(nextUser));
    setAuthUser(nextUser);
    setForm((current) => ({ ...current, password: "" }));
    setMessage("Login saved on this device.");
    navigate("/home");
  };

  return (
    <div className="panel auth-panel">
      <div className="auth-shell glass">
        <div className="auth-copy">
          <p className="eyebrow">Welcome Back</p>
          <h2>Login To AI Coding Mentor</h2>
          <p className="text-muted">
            Sign in to keep your mentor requests, notifications, and chats linked
            to your profile.
          </p>
        </div>
        <form className="mentor-form auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) =>
                setForm((current) => ({ ...current, name: e.target.value }))
              }
              placeholder="Your full name"
            />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((current) => ({ ...current, email: e.target.value }))
              }
              placeholder="you@example.com"
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((current) => ({ ...current, password: e.target.value }))
              }
              placeholder="Enter your password"
            />
          </div>
          <button className="submit-btn" type="submit">
            Login
          </button>
          {authUser && (
            <p className="text-muted">
              Signed in as {authUser.name} ({authUser.email})
            </p>
          )}
          {message && <p className="text-muted">{message}</p>}
        </form>
      </div>
    </div>
  );
}

function Home({ authUser }) {
  const [profile, setProfile] = useState({
    userId,
    userName: authUser?.name || localStorage.getItem("mentorUserName") || "",
    userEmail: authUser?.email || localStorage.getItem("mentorUserEmail") || "",
  });
  const [mentors, setMentors] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [weaknesses, setWeaknesses] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestFeedback, setRequestFeedback] = useState("");
  const [mentorCreateFeedback, setMentorCreateFeedback] = useState("");
  const [mentorForm, setMentorForm] = useState({
    name: "", role: "", company: "", skills: "", experience: "Intermediate", email: "", availability: "", bio: "",
  });
  const [roomId, setRoomId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");

  const loadHub = async () => {
    try {
      const [mentorRes, reqRes, notifRes] = await Promise.all([
        fetch(`${API}/api/mentors`),
        fetch(`${API}/api/mentor-requests?userId=${profile.userId}`),
        fetch(`${API}/api/notifications?userId=${profile.userId}`),
      ]);
      const mentorData = await mentorRes.json();
      const reqData = await reqRes.json();
      const notifData = await notifRes.json();
      setMentors(mentorData.mentors || []);
      setRecommended(mentorData.recommended || []);
      setWeaknesses(mentorData.weaknesses || []);
      setRequests(reqData.requests || []);
      setNotifications(notifData.notifications || []);
    } catch {
      return;
    }
  };

  const loadChat = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`${API}/api/chat/${id}`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch {
      return;
    }
  };

  useEffect(() => {
    localStorage.setItem("mentorUserName", profile.userName);
    localStorage.setItem("mentorUserEmail", profile.userEmail);
  }, [profile]);

  useEffect(() => {
    const id = setTimeout(() => {
      loadHub();
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!roomId) return;
    const bootId = setTimeout(() => {
      loadChat(roomId);
    }, 0);
    const id = setInterval(() => loadChat(roomId), 4000);
    return () => {
      clearTimeout(bootId);
      clearInterval(id);
    };
  }, [roomId]);

  const createMentor = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/mentors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mentorForm),
      });
      const data = await res.json();

      if (!res.ok) {
        setMentorCreateFeedback(data.error || "Could not create mentor profile.");
        return;
      }

      if (data.mentor) {
        setMentors((current) => [data.mentor, ...current]);
        setRecommended((current) =>
          current.length === 0 ? [data.mentor] : current,
        );
      }

      setMentorCreateFeedback("Mentor profile created successfully. You can see it in All Mentors now.");
      setMentorForm({ name: "", role: "", company: "", skills: "", experience: "Intermediate", email: "", availability: "", bio: "" });
      loadHub();
    } catch {
      setMentorCreateFeedback("Backend unavailable. Mentor profile was not created.");
    }
  };

  const requestGuidance = async () => {
    if (!selectedMentor || !requestMessage.trim()) return;
    const res = await fetch(`${API}/api/mentor-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: profile.userId,
        userName: profile.userName,
        userEmail: profile.userEmail,
        mentorId: selectedMentor.id,
        message: requestMessage,
        userWeaknesses: weaknesses,
      }),
    });
    const data = await res.json();
    setRequestFeedback(data.emailResult?.delivered ? "Request saved and email sent." : data.error || "Request saved.");
    loadHub();
  };

  const sendChat = async () => {
    if (!roomId || !chatText.trim()) return;
    await fetch(`${API}/api/chat/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: profile.userId, senderRole: "user", text: chatText }),
    });
    setChatText("");
    loadChat(roomId);
  };

  const mentorCards = recommended.length ? recommended : mentors;

  return (
    <div className="page">
      <section className="hero glass">
        <div className="hero-left">
          <p className="eyebrow">AI Coding Mentor</p>
          <h1>Real Mentor Connection</h1>
          <p className="hero-sub">Sign up mentors, match them by weakness areas, send real requests, and keep a live chat thread.</p>
          <div className="mini-card" style={{ marginTop: "1rem" }}>
            <h4>Learner Profile</h4>
            <input value={profile.userName} onChange={(e) => setProfile((p) => ({ ...p, userName: e.target.value }))} placeholder="Your name" />
            <input value={profile.userEmail} onChange={(e) => setProfile((p) => ({ ...p, userEmail: e.target.value }))} placeholder="Your email" style={{ marginTop: "0.5rem" }} />
            <small className="text-muted">Weaknesses: {weaknesses.join(", ") || "None yet"}</small>
          </div>
        </div>
        <div className="hero-right glass">
          <div className="dashboard-cards">
            <div className="mini-card"><h4>Mentors</h4><p>{mentors.length}</p><small>Stored by backend</small></div>
            <div className="mini-card"><h4>Matches</h4><p>{recommended.length}</p><small>AI ranked</small></div>
            <div className="mini-card"><h4>Requests</h4><p>{requests.length}</p><small>Status tracked</small></div>
            <div className="mini-card"><h4>Unread</h4><p>{notifications.filter((n) => n.status === "unread").length}</p><small>Notifications</small></div>
          </div>
        </div>
      </section>

      <section className="glass card">
        <div className="flex-row space-between">
          <div><h3>Recommended Mentors</h3><p className="text-muted">Matched using Hindsight weakness overlap.</p></div>
          <button className="outline-btn" onClick={loadHub}>Refresh</button>
        </div>
        <div className="mentor-grid">
          {mentorCards.map((mentor) => (
            <div key={mentor.id} className="mentor-card" onClick={() => setSelectedMentor(mentor)}>
              <div className="mentor-top"><div className="avatar">{mentor.name?.[0] || "M"}</div><div><h4>{mentor.name}</h4><p>{mentor.role}</p></div></div>
              <div className="mentor-meta"><span className={`badge ${mentor.status === "available" ? "online" : "busy"}`}>{mentor.status || "available"}</span><span className="text-muted">{mentor.company}</span></div>
              <p className="text-muted">Match score: {mentor.matchScore || 0}% • {mentor.experience}</p>
              <div className="skill-row">{(mentor.skills || []).map((skill) => <span key={skill} className="chip">{skill}</span>)}</div>
              <button className="btn primary-btn">Request Guidance</button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h3>Mentor Onboarding</h3>
        <form className="mentor-form" onSubmit={createMentor}>
          <div className="grid-2">
            <input value={mentorForm.name} onChange={(e) => setMentorForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" required />
            <input value={mentorForm.role} onChange={(e) => setMentorForm((f) => ({ ...f, role: e.target.value }))} placeholder="Role" required />
            <input value={mentorForm.company} onChange={(e) => setMentorForm((f) => ({ ...f, company: e.target.value }))} placeholder="Company" required />
            <input value={mentorForm.email} onChange={(e) => setMentorForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" required />
            <input value={mentorForm.skills} onChange={(e) => setMentorForm((f) => ({ ...f, skills: e.target.value }))} placeholder="react, dsa, system design" required />
            <select value={mentorForm.experience} onChange={(e) => setMentorForm((f) => ({ ...f, experience: e.target.value }))} className="filter-select"><option>Junior</option><option>Intermediate</option><option>Senior</option></select>
          </div>
          <input value={mentorForm.availability} onChange={(e) => setMentorForm((f) => ({ ...f, availability: e.target.value }))} placeholder="Availability" required />
          <textarea rows={3} value={mentorForm.bio} onChange={(e) => setMentorForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Bio" />
          <button className="submit-btn">Create Mentor Profile</button>
          {mentorCreateFeedback && (
            <p className="text-muted" style={{ marginTop: "0.75rem" }}>
              {mentorCreateFeedback}
            </p>
          )}
        </form>
      </section>

      <section className="glass card">
        <div className="flex-row space-between">
          <div>
            <h3>All Mentors</h3>
            <p className="text-muted">
              Newly created mentors will appear here after you create them.
            </p>
          </div>
          <button className="outline-btn" onClick={loadHub}>
            Refresh Mentors
          </button>
        </div>
        <div className="mentor-grid">
          {mentors.length === 0 && (
            <p className="text-muted">No mentors available yet.</p>
          )}
          {mentors.map((mentor) => (
            <div
              key={`all-${mentor.id}`}
              className="mentor-card"
              onClick={() => setSelectedMentor(mentor)}
            >
              <div className="mentor-top">
                <div className="avatar">{mentor.name?.[0] || "M"}</div>
                <div>
                  <h4>{mentor.name}</h4>
                  <p>{mentor.role}</p>
                </div>
              </div>
              <div className="mentor-meta">
                <span
                  className={`badge ${mentor.status === "available" ? "online" : "busy"}`}
                >
                  {mentor.status || "available"}
                </span>
                <span className="text-muted">{mentor.company}</span>
              </div>
              <p className="text-muted">
                Experience: {mentor.experience} | Availability:{" "}
                {mentor.availability || "Not shared yet"}
              </p>
              <div className="skill-row">
                {(mentor.skills || []).map((skill) => (
                  <span key={`${mentor.id}-${skill}`} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h3>Request Status</h3>
        <div className="problem-grid">
          {requests.length === 0 && <p className="text-muted">No mentor requests yet.</p>}
          {requests.map((request) => (
            <article key={request.id} className="problem-card">
              <h5>{request.mentorName}</h5>
              <p>Status: {request.status}</p>
              <p>{request.message}</p>
              <div className="tag-row">{(request.userWeaknesses || []).map((w) => <span key={w} className="chip">{w}</span>)}</div>
              <button className="outline-btn" onClick={() => setRoomId(request.roomId)}>Open Chat</button>
            </article>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h3>Notifications</h3>
        <ul>{notifications.length === 0 ? <li>No notifications yet.</li> : notifications.map((n) => <li key={n.id}>{n.message} ({n.status})</li>)}</ul>
      </section>

      <section className="glass card">
        <h3>Mentor Chat</h3>
        <div className="problem-card">{chatMessages.length === 0 ? <p>No chat selected yet.</p> : chatMessages.map((m) => <div key={m.id} className="timeline-item"><strong>{m.senderRole}:</strong> {m.text}</div>)}</div>
        <div className="filter-row" style={{ marginTop: "0.8rem" }}>
          <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Type a message" className="filter-select" style={{ flex: 1 }} />
          <button className="outline-btn" onClick={sendChat}>Send</button>
        </div>
      </section>

      {selectedMentor && (
        <div className="modal-backdrop" onClick={() => setSelectedMentor(null)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="flex-row space-between">
              <div><h3>{selectedMentor.name}</h3><p>{selectedMentor.role} at {selectedMentor.company}</p></div>
              <button className="close-btn" onClick={() => setSelectedMentor(null)}>x</button>
            </div>
            <p className="text-muted">{selectedMentor.bio || "Mentor profile ready to support coding growth."}</p>
            <div className="skill-row">{(selectedMentor.skills || []).map((skill) => <span key={skill} className="chip">{skill}</span>)}</div>
            <p className="text-muted">Availability: {selectedMentor.availability || "Not shared yet"}</p>
            <textarea rows={4} value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Message to mentor" />
            <button className="btn primary-btn" onClick={requestGuidance}>Request Guidance</button>
            {requestFeedback && <p className="text-muted">{requestFeedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Submit({ setFeedback, setSessionCount, setMistakeDNA, setConfidence, setTimeline, setChecklist, setChallenge }) {
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [eli5Text, setEli5Text] = useState("");
  const [babyStepsText, setBabyStepsText] = useState("");
  const [thinkingReplayText, setThinkingReplayText] = useState("");
  const [preflightWarnings, setPreflightWarnings] = useState([]);
  const [checklistLocal, setChecklistLocal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [typingReplay, setTypingReplay] = useState({
    totalEdits: 0,
    pauseMoments: 0,
    deletionBursts: 0,
    rewriteMoments: 0,
    longestPauseMs: 0,
    focusArea: "problem decomposition",
  });
  const [lastEditAt, setLastEditAt] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const preflight = await fetch(`${API}/api/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem, solution }) });
      const preflightData = await preflight.json();
      setPreflightWarnings(preflightData.warnings || []);
      setChecklistLocal(preflightData.checklist || []);
      setChecklist(preflightData.checklist || []);
      const [eli5Res, babyRes, replayRes] = await Promise.all([
        fetch(`${API}/api/eli5`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem }) }),
        fetch(`${API}/api/baby-steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem }) }),
        fetch(`${API}/api/thinking-replay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem, solution, replay: typingReplay }) }),
      ]);
      const eli5Data = await eli5Res.json();
      const babyData = await babyRes.json();
      const replayData = await replayRes.json();
      setEli5Text(eli5Data.explanation || "");
      setBabyStepsText(babyData.steps || "");
      setThinkingReplayText(replayData.replay || "");
      const res = await fetch(`${API}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem, solution }) });
      const data = await res.json();
      setFeedbackText(data.feedback || "No feedback.");
      setFeedback(data.feedback || "No feedback.");
      setSessionCount((p) => p + 1);
      const dash = await fetch(`${API}/api/dashboard`);
      const dashData = await dash.json();
      if (dashData.mistakeDNA) setMistakeDNA(dashData.mistakeDNA);
      if (typeof dashData.confidence === "number") setConfidence(dashData.confidence);
      if (Array.isArray(dashData.timeline)) setTimeline(dashData.timeline);
      if (Array.isArray(dashData.checklist)) setChecklist(dashData.checklist);
      const chall = await fetch(`${API}/api/challenge`);
      const challData = await chall.json();
      setChallenge(challData.challenge || "No challenge loaded.");
    } catch {
      setFeedbackText("Backend unavailable.");
      setFeedback("Backend unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const handleSolutionChange = (value) => {
    const now = Date.now();
    const diff = solution.length - value.length;
    const pause = lastEditAt ? now - lastEditAt : 0;
    setTypingReplay((current) => ({
      totalEdits: current.totalEdits + 1,
      pauseMoments: current.pauseMoments + (pause > 7000 ? 1 : 0),
      deletionBursts: current.deletionBursts + (diff > 8 ? 1 : 0),
      rewriteMoments:
        current.rewriteMoments +
        ((diff > 0 && value.length > 20) || (pause > 5000 && diff !== 0) ? 1 : 0),
      longestPauseMs: Math.max(current.longestPauseMs, pause),
      focusArea:
        /base|recurs|dp|memo|tree|graph/i.test(value)
          ? "core recurrence or state definition"
          : /if|while|for|case/i.test(value)
            ? "control flow and edge cases"
            : "problem decomposition",
    }));
    setLastEditAt(now);
    setSolution(value);
  };

  const runLearningModes = async () => {
    if (!problem.trim()) return;
    setModeLoading(true);
    try {
      const [eli5Res, babyRes] = await Promise.all([
        fetch(`${API}/api/eli5`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem }) }),
        fetch(`${API}/api/baby-steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem }) }),
      ]);
      const eli5Data = await eli5Res.json();
      const babyData = await babyRes.json();
      setEli5Text(eli5Data.explanation || "");
      setBabyStepsText(babyData.steps || "");
    } catch {
      setEli5Text("ELI5 mode is unavailable right now.");
      setBabyStepsText("Baby Steps mode is unavailable right now.");
    } finally {
      setModeLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>Submit Code</h2>
      <form onSubmit={handleSubmit} className="mentor-form">
        <textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Problem" required />
        <textarea rows={10} value={solution} onChange={(e) => handleSolutionChange(e.target.value)} className="code-input" placeholder="Solution" required />
        <div className="filter-row">
          <button type="button" className="outline-btn" onClick={runLearningModes} disabled={modeLoading}>
            {modeLoading ? "Loading modes..." : "Run ELI5 + Baby Steps"}
          </button>
          <button className="submit-btn" disabled={loading}>{loading ? "Analyzing..." : "Get Feedback & Memory"}</button>
        </div>
      </form>
      <div className="mini-card"><h4>Ghost Warnings</h4><ul>{preflightWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
      <div className="mini-card"><h4>Checklist</h4><ul>{checklistLocal.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      {eli5Text && <div className="mini-card"><h4>ELI5 Mode</h4><p style={{ whiteSpace: "pre-wrap" }}>{eli5Text}</p></div>}
      {babyStepsText && <div className="mini-card"><h4>Baby Steps Mode</h4><p style={{ whiteSpace: "pre-wrap" }}>{babyStepsText}</p></div>}
      {thinkingReplayText && <div className="mini-card"><h4>Thinking Replay</h4><p style={{ whiteSpace: "pre-wrap" }}>{thinkingReplayText}</p></div>}
      {feedbackText && <div className="mini-card"><FeedbackSummary feedback={feedbackText} /></div>}
    </div>
  );
}

function Dashboard({ mistakeDNA, confidence, timeline, checklist, topicsLearned, totalMistakes, timeTaken, improvementRate, weakAreas, strongAreas, progressGraph, improvementInsights }) {
  return (
    <div className="panel">
      <h2>Dashboard</h2>
      <div className="dashboard-cards">
        <div className="mini-card"><h4>Topics Learned</h4><p>{topicsLearned.length}</p><small>{topicsLearned.join(", ") || "No data yet"}</small></div>
        <div className="mini-card"><h4>Total Mistakes</h4><p>{totalMistakes}</p><small>Keep notes + repeat weak patterns</small></div>
        <div className="mini-card"><h4>Time Tracked</h4><p>{timeTaken} min</p><small>Quick feedback loops</small></div>
        <div className="mini-card"><h4>Improvement Rate</h4><p>{improvementRate}%</p><small>vs session 1</small></div>
      </div>
      <div className="flex-row space-between">
        <section className="resource-links glass" style={{ padding: "1rem" }}><h4>Weak Areas</h4><ul>{weakAreas.length ? weakAreas.map((t) => <li key={t}>{t}</li>) : <li>None identified yet</li>}</ul></section>
        <section className="resource-links glass" style={{ padding: "1rem" }}><h4>Strong Areas</h4><ul>{strongAreas.length ? strongAreas.map((t) => <li key={t}>{t}</li>) : <li>None identified yet</li>}</ul></section>
      </div>
      <h4>Progress Graph</h4>
      <div className="progress-graph">{progressGraph.map((p) => <div key={p.label} className="progress-bar-column"><div className="progress-bar" style={{ height: `${p.value}%` }} title={`${p.value}% - ${p.note}`} /><span>{p.label}</span></div>)}</div>
      <h4>Improvement Insights</h4>
      <ul>{improvementInsights.length ? improvementInsights.map((ins, idx) => <li key={idx}>{ins}</li>) : <li>Collecting insights...</li>}</ul>
      <h4>Skill DNA</h4>
      <p>Confidence: {confidence}%</p>
      <div className="dna-values">{DNA.map((c) => <div key={c} className="dna-row"><span>{c}</span><strong>{mistakeDNA[c] || 0}%</strong></div>)}</div>
      <h4>Historic Timeline</h4>
      {timeline.map((t, i) => <div key={`${t.session}-${i}`} className="timeline-item">{t.session}: {t.confidence}% - {t.note}</div>)}
      <h4>Checklist</h4>
      <ul>{checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
    </div>
  );
}

function Problems() {
  const [problems, setProblems] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [practiceAgain, setPracticeAgain] = useState([]);
  const [weakTopics, setWeakTopics] = useState([]);
  const [sourceStats, setSourceStats] = useState([]);
  const [topicFilter, setTopicFilter] = useState("All");
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [problemId, setProblemId] = useState("");

  const loadProblems = async () => {
    try {
      const params = new URLSearchParams();
      if (topicFilter !== "All") params.set("topic", topicFilter);
      if (difficultyFilter !== "All") params.set("difficulty", difficultyFilter);
      if (sourceFilter !== "All") params.set("source", sourceFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (problemId.trim()) params.set("id", problemId.trim());
      const res = await fetch(`${API}/api/problems?${params.toString()}`);
      const data = await res.json();
      setProblems(data.problems || []);
      setRecommended(data.recommended || []);
      setPracticeAgain(data.practiceAgain || []);
      setWeakTopics(data.weakTopics || []);
      setSourceStats(data.sourceStats || []);
    } catch {
      setProblems([]);
      setRecommended([]);
      setPracticeAgain([]);
      setWeakTopics([]);
      setSourceStats([]);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      loadProblems();
    }, 0);
    return () => clearTimeout(id);
  }, [topicFilter, difficultyFilter, sourceFilter, searchQuery, problemId]);

  return (
    <div className="panel problems-panel">
      <h2>Practice Problem Dashboard</h2>
      <div className="filter-row">
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search title or keyword" className="filter-select" />
        <input value={problemId} onChange={(e) => setProblemId(e.target.value)} placeholder="Problem ID" className="filter-select" />
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="filter-select"><option>All</option><option>Arrays</option><option>String</option><option>Linked List</option><option>Dynamic Programming</option><option>Tree</option><option>Graph</option></select>
        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="filter-select"><option>All</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setProblemId(""); }} className="filter-select"><option>All</option><option>LeetCode</option><option>GeeksforGeeks</option><option>CodeChef</option><option>Codeforces</option></select>
      </div>
      <p className="text-muted">Weak topics from Hindsight: {weakTopics.join(", ") || "None yet"}</p>
      <div className="dashboard-cards">{sourceStats.length === 0 ? <div className="mini-card"><h4>Source Status</h4><small>No platform data loaded yet.</small></div> : sourceStats.map((stat) => <div key={stat.source} className="mini-card"><h4>{stat.source}</h4><p>{stat.count}</p><small>{stat.mode === "live" ? "Live fetch" : "Fallback"} | {stat.note}</small></div>)}</div>
      <div className="problem-section"><h4>Recommended for you</h4><div className="problem-grid">{recommended.length === 0 ? <p>No recommended problems right now.</p> : recommended.map((p) => <article key={p.id} className="problem-card recommended"><h5>{p.title}</h5><p>{p.source} | {p.difficulty} | {p.topic}</p></article>)}</div></div>
      <div className="problem-section"><h4>Practice again</h4><div className="problem-grid">{practiceAgain.length === 0 ? <p>No practice-again items yet.</p> : practiceAgain.map((p) => <article key={p.id} className="problem-card practice-again"><h5>{p.title}</h5><p>{p.source} | {p.difficulty} | {p.topic}</p></article>)}</div></div>
      <div className="problem-section"><h4>All problems</h4><div className="problem-grid">{problems.length === 0 ? <p>No problems match current filters.</p> : problems.map((p) => <article key={p.id} className="problem-card"><h5>{p.title}</h5><p>{p.source} | {p.difficulty} | {p.topic}</p><div className="tag-row">{(p.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}</div></article>)}</div></div>
    </div>
  );
}

function Challenge({ challenge, fetchChallenge }) {
  return <div className="panel"><h2>Smart Challenge</h2><p>{challenge}</p><button className="outline-btn" onClick={fetchChallenge}>Regenerate</button></div>;
}

function TeachBack({ teachBackConcept, teachBackExplanation, setTeachBackConcept, setTeachBackExplanation, teachBackScore, teachBackResult, evaluateTeachBack }) {
  return (
    <div className="panel">
      <h2>TeachBack</h2>
      <div className="input-group"><label>Concept</label><input value={teachBackConcept} onChange={(e) => setTeachBackConcept(e.target.value)} /></div>
      <div className="input-group"><label>Explain</label><textarea rows={4} value={teachBackExplanation} onChange={(e) => setTeachBackExplanation(e.target.value)} /></div>
      <button className="outline-btn" onClick={evaluateTeachBack}>Evaluate</button>
      {teachBackScore !== null && <p>Score: {teachBackScore}%</p>}
      {teachBackResult && <p>{teachBackResult}</p>}
    </div>
  );
}

function ProtectedRoute({ authUser, children }) {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem("mentorAuthUser");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [mistakeDNA, setMistakeDNA] = useState({ "Logic Errors": 40, Syntax: 50, "Edge Cases": 45, Complexity: 42, "Data Structures": 48, "Null Handling": 46 });
  const [confidence, setConfidence] = useState(55);
  const [timeline, setTimeline] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [topicsLearned, setTopicsLearned] = useState([]);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [improvementRate, setImprovementRate] = useState(0);
  const [weakAreas, setWeakAreas] = useState([]);
  const [strongAreas, setStrongAreas] = useState([]);
  const [progressGraph, setProgressGraph] = useState([]);
  const [improvementInsights, setImprovementInsights] = useState([]);
  const [challenge, setChallenge] = useState("Click regenerate.");
  const [teachBackConcept, setTeachBackConcept] = useState("null handling");
  const [teachBackExplanation, setTeachBackExplanation] = useState("");
  const [teachBackScore, setTeachBackScore] = useState(null);
  const [teachBackResult, setTeachBackResult] = useState("");
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const dashRes = await fetch(`${API}/api/dashboard`);
        const dash = await dashRes.json();
        if (dash.mistakeDNA) setMistakeDNA(dash.mistakeDNA);
        if (typeof dash.confidence === "number") setConfidence(dash.confidence);
        if (Array.isArray(dash.timeline)) setTimeline(dash.timeline);
        if (Array.isArray(dash.checklist)) setChecklist(dash.checklist);
        if (Array.isArray(dash.topicsLearned)) setTopicsLearned(dash.topicsLearned);
        if (typeof dash.totalMistakes === "number") setTotalMistakes(dash.totalMistakes);
        if (typeof dash.timeTaken === "number") setTimeTaken(dash.timeTaken);
        if (typeof dash.improvementRate === "number") setImprovementRate(dash.improvementRate);
        if (Array.isArray(dash.weakAreas)) setWeakAreas(dash.weakAreas);
        if (Array.isArray(dash.strongAreas)) setStrongAreas(dash.strongAreas);
        if (Array.isArray(dash.progressGraph)) setProgressGraph(dash.progressGraph);
        if (Array.isArray(dash.improvementInsights)) setImprovementInsights(dash.improvementInsights);
        const challRes = await fetch(`${API}/api/challenge`);
        const chall = await challRes.json();
        setChallenge(chall.challenge || "No challenge");
      } catch {
        return;
      }
    })();
  }, []);

  const evaluateTeachBack = async () => {
    if (!teachBackExplanation.trim()) {
      setTeachBackResult("Type explanation");
      return;
    }
    try {
      const res = await fetch(`${API}/api/teachback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept: teachBackConcept, explanation: teachBackExplanation }) });
      const data = await res.json();
      setTeachBackScore(data.score || 0);
      setTeachBackResult(data.evaluation || "No eval");
    } catch {
      setTeachBackResult("Unavailable");
    }
  };

  return (
    <Router>
      <div className="container">
        <header className="header">
          <div className="header-left"><div className="nav-icon">AI</div><div className="logo-row"><div className="logo-icon"></div><div><h1>AI Coding Mentor</h1><p>Multi-page Hindsight</p></div></div></div>
          <nav className="top-nav">
            <NavLink to="/login" className="nav-link">Login</NavLink>
            {authUser && (
              <>
                <NavLink to="/home" className="nav-link">Home</NavLink>
                <NavLink to="/submit" className="nav-link">Submit</NavLink>
                <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>
                <NavLink to="/problems" className="nav-link">Problems</NavLink>
                <NavLink to="/challenge" className="nav-link">Challenge</NavLink>
                <NavLink to="/teachback" className="nav-link">TeachBack</NavLink>
              </>
            )}
          </nav>
        </header>
        <div className="session-info">
          {sessionCount} sessions Confidence {confidence}% {authUser ? `| Signed in as ${authUser.name}` : "| Not logged in"}
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/home" element={<ProtectedRoute authUser={authUser}><Home key={authUser?.email || "guest"} authUser={authUser} /></ProtectedRoute>} />
          <Route path="/login" element={<Login authUser={authUser} setAuthUser={setAuthUser} />} />
          <Route path="/submit" element={<ProtectedRoute authUser={authUser}><Submit setFeedback={() => {}} setSessionCount={setSessionCount} setMistakeDNA={setMistakeDNA} setConfidence={setConfidence} setTimeline={setTimeline} setChecklist={setChecklist} setChallenge={setChallenge} /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute authUser={authUser}><Dashboard mistakeDNA={mistakeDNA} confidence={confidence} timeline={timeline} checklist={checklist} topicsLearned={topicsLearned} totalMistakes={totalMistakes} timeTaken={timeTaken} improvementRate={improvementRate} weakAreas={weakAreas} strongAreas={strongAreas} progressGraph={progressGraph} improvementInsights={improvementInsights} /></ProtectedRoute>} />
          <Route path="/problems" element={<ProtectedRoute authUser={authUser}><Problems /></ProtectedRoute>} />
          <Route path="/challenge" element={<ProtectedRoute authUser={authUser}><Challenge challenge={challenge} fetchChallenge={async () => { const res = await fetch(`${API}/api/challenge`); const data = await res.json(); setChallenge(data.challenge || "No challenge"); }} /></ProtectedRoute>} />
          <Route path="/teachback" element={<ProtectedRoute authUser={authUser}><TeachBack teachBackConcept={teachBackConcept} teachBackExplanation={teachBackExplanation} setTeachBackConcept={setTeachBackConcept} setTeachBackExplanation={setTeachBackExplanation} teachBackScore={teachBackScore} teachBackResult={teachBackResult} evaluateTeachBack={evaluateTeachBack} /></ProtectedRoute>} />
        </Routes>
        <footer className="footer">Built for HackWithBangalore</footer>
      </div>
    </Router>
  );
}

export default App;
