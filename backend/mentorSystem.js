const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const COLLECTION_FILES = {
  mentors: "mentors.json",
  requests: "mentorRequests.json",
  notifications: "notifications.json",
  chats: "chatMessages.json",
};

const DEFAULT_MENTORS = [
  {
    id: "mentor-aisha",
    name: "Aisha Amin",
    role: "Senior Software Mentor",
    company: "CodeFlow",
    skills: ["react", "node.js", "system design", "javascript"],
    experience: "Senior",
    email: "aisha.mentor@example.com",
    availability: "Weekdays 6 PM - 9 PM IST",
    bio: "Helps learners move from frontend basics to production-ready full-stack apps.",
    status: "available",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mentor-rohan",
    name: "Rohan Patel",
    role: "Algorithm Coach",
    company: "AlgoLab",
    skills: ["dsa", "graphs", "dynamic programming", "c++", "python"],
    experience: "Intermediate",
    email: "rohan.mentor@example.com",
    availability: "Weekends 10 AM - 2 PM IST",
    bio: "Strong fit for competitive programming, interview prep, and debugging patterns.",
    status: "available",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mentor-nisha",
    name: "Nisha Verma",
    role: "Full Stack Guide",
    company: "LaunchPad",
    skills: ["javascript", "ui", "testing", "devops", "react"],
    experience: "Senior",
    email: "nisha.mentor@example.com",
    availability: "Daily 7 PM - 10 PM IST",
    bio: "Focuses on frontend architecture, project polish, and shipping confidence.",
    status: "available",
    createdAt: new Date().toISOString(),
  },
];

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item?.toString().trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(name) {
  ensureDirectory();
  return path.join(DATA_DIR, COLLECTION_FILES[name]);
}

function readLocalCollection(name, fallback = []) {
  const filePath = getFilePath(name);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse ${name} local collection:`, error.message);
    return fallback;
  }
}

function writeLocalCollection(name, data) {
  const filePath = getFilePath(name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function buildFirebaseUrl(baseUrl, collection) {
  const auth = process.env.FIREBASE_DB_SECRET
    ? `?auth=${process.env.FIREBASE_DB_SECRET}`
    : "";
  return `${baseUrl.replace(/\/$/, "")}/${collection}.json${auth}`;
}

function firebaseToArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(Boolean);
  return Object.values(payload);
}

async function readCollection(name, fallback = []) {
  const firebaseUrl = process.env.FIREBASE_DB_URL;
  if (firebaseUrl) {
    try {
      const response = await fetch(buildFirebaseUrl(firebaseUrl, name));
      if (response.ok) {
        return firebaseToArray(await response.json());
      }
    } catch (error) {
      console.warn(`Firebase read failed for ${name}:`, error.message);
    }
  }

  return readLocalCollection(name, fallback);
}

async function writeCollection(name, data) {
  const firebaseUrl = process.env.FIREBASE_DB_URL;
  if (firebaseUrl) {
    try {
      const objectPayload = Object.fromEntries(
        data.map((item) => [item.id, item]),
      );
      const response = await fetch(buildFirebaseUrl(firebaseUrl, name), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(objectPayload),
      });
      if (response.ok) {
        return;
      }
    } catch (error) {
      console.warn(`Firebase write failed for ${name}:`, error.message);
    }
  }

  writeLocalCollection(name, data);
}

async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}) {
  if (!to) {
    return { delivered: false, mode: "disabled", note: "Missing recipient email." };
  }

  if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: process.env.EMAIL_FROM },
          reply_to: replyTo ? { email: replyTo } : undefined,
          subject,
          content: [{ type: "text/html", value: html }],
        }),
      });

      if (response.ok) {
        return { delivered: true, mode: "sendgrid" };
      }
      return {
        delivered: false,
        mode: "sendgrid",
        note: `SendGrid returned ${response.status}`,
      };
    } catch (error) {
      return { delivered: false, mode: "sendgrid", note: error.message };
    }
  }

  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM
  ) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        replyTo,
        subject,
        html,
      });

      return { delivered: true, mode: "smtp" };
    } catch (error) {
      return { delivered: false, mode: "smtp", note: error.message };
    }
  }

  return {
    delivered: false,
    mode: "disabled",
    note: "Configure SENDGRID_API_KEY or SMTP_* variables to send real email.",
  };
}

function buildMentorMatch(mentor, weaknesses = []) {
  const overlap = mentor.skills.filter((skill) =>
    weaknesses.some((weakness) => skill.includes(weakness.toLowerCase())),
  );

  let score = overlap.length * 35;
  if ((mentor.status || "").toLowerCase() === "available") score += 15;
  if ((mentor.experience || "").toLowerCase() === "senior") score += 20;
  if ((mentor.experience || "").toLowerCase() === "intermediate") score += 10;

  return {
    ...mentor,
    matchScore: Math.min(score, 100),
    overlapSkills: overlap,
  };
}

async function ensureMentorSeed() {
  const mentors = await readCollection("mentors", DEFAULT_MENTORS);
  if (mentors.length === 0) {
    await writeCollection("mentors", DEFAULT_MENTORS);
    return DEFAULT_MENTORS;
  }
  return mentors;
}

function buildChatRoomId(request) {
  return `room-${request.userId}-${request.mentorId}`;
}

function pickWeaknessesFromBody(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function registerMentorRoutes(app, { inferWeakTopics }) {
  app.get("/api/mentors", async (req, res) => {
    try {
      const mentors = await ensureMentorSeed();
      const requestedWeaknesses = normalizeList(req.query.weaknesses || "");
      const weaknesses =
        requestedWeaknesses.length > 0
          ? requestedWeaknesses
          : normalizeList(await inferWeakTopics());

      const ranked = mentors
        .map((mentor) => buildMentorMatch(mentor, weaknesses))
        .sort((a, b) => b.matchScore - a.matchScore);

      res.json({
        mentors: ranked,
        recommended: ranked.slice(0, 3),
        weaknesses,
        storageMode: process.env.FIREBASE_DB_URL ? "firebase" : "local-json",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load mentors." });
    }
  });

  app.post("/api/mentors", async (req, res) => {
    try {
      const mentor = {
        id: createId("mentor"),
        name: req.body.name?.trim(),
        role: req.body.role?.trim(),
        company: req.body.company?.trim(),
        skills: normalizeList(req.body.skills),
        experience: req.body.experience?.trim() || "Intermediate",
        email: req.body.email?.trim(),
        availability: req.body.availability?.trim(),
        bio: req.body.bio?.trim() || "",
        status: "available",
        createdAt: new Date().toISOString(),
      };

      if (
        !mentor.name ||
        !mentor.role ||
        !mentor.company ||
        mentor.skills.length === 0 ||
        !mentor.email ||
        !mentor.availability
      ) {
        return res.status(400).json({ error: "Missing required mentor fields." });
      }

      const mentors = await ensureMentorSeed();
      mentors.unshift(mentor);
      await writeCollection("mentors", mentors);
      res.status(201).json({ mentor });
    } catch (error) {
      res.status(500).json({ error: "Failed to create mentor profile." });
    }
  });

  app.get("/api/mentor-requests", async (req, res) => {
    try {
      const requests = await readCollection("requests", []);
      const filtered = requests
        .filter((request) => {
          if (req.query.userId && request.userId !== req.query.userId) return false;
          if (req.query.mentorId && request.mentorId !== req.query.mentorId)
            return false;
          return true;
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      res.json({ requests: filtered });
    } catch (error) {
      res.status(500).json({ error: "Failed to load mentor requests." });
    }
  });

  app.post("/api/mentor-requests", async (req, res) => {
    try {
      const mentors = await ensureMentorSeed();
      const mentor = mentors.find((item) => item.id === req.body.mentorId);
      if (!mentor) {
        return res.status(404).json({ error: "Mentor not found." });
      }

      const userWeaknesses = pickWeaknessesFromBody(req.body.userWeaknesses);
      const inferredWeaknesses =
        userWeaknesses.length > 0 ? userWeaknesses : await inferWeakTopics();
      const timestamp = new Date().toISOString();

      const request = {
        id: createId("request"),
        userId: req.body.userId?.trim(),
        userName: req.body.userName?.trim() || "Anonymous learner",
        userEmail: req.body.userEmail?.trim() || "",
        mentorId: mentor.id,
        mentorName: mentor.name,
        message: req.body.message?.trim(),
        userWeaknesses: inferredWeaknesses,
        status: "pending",
        roomId: buildChatRoomId({
          userId: req.body.userId?.trim(),
          mentorId: mentor.id,
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      if (!request.userId || !request.message) {
        return res.status(400).json({ error: "Missing request details." });
      }

      const requests = await readCollection("requests", []);
      requests.unshift(request);
      await writeCollection("requests", requests);

      const notifications = await readCollection("notifications", []);
      notifications.unshift(
        {
          id: createId("notif"),
          mentorId: mentor.id,
          requestId: request.id,
          type: "request_created",
          status: "unread",
          message: `${request.userName} requested guidance from ${mentor.name}.`,
          createdAt: timestamp,
        },
        {
          id: createId("notif"),
          userId: request.userId,
          requestId: request.id,
          type: "request_created",
          status: "unread",
          message: `Your request to ${mentor.name} is pending.`,
          createdAt: timestamp,
        },
      );
      await writeCollection("notifications", notifications);

      const emailResult = await sendEmail({
        to: mentor.email,
        replyTo: request.userEmail || undefined,
        subject: `New mentorship request from ${request.userName}`,
        html: `
          <h2>New mentorship request</h2>
          <p><strong>User:</strong> ${request.userName}</p>
          <p><strong>User Email:</strong> ${request.userEmail || "Not provided"}</p>
          <p><strong>Message:</strong> ${request.message}</p>
          <p><strong>Weakness Areas:</strong> ${(request.userWeaknesses || []).join(", ") || "None identified"}</p>
          <p><strong>Reply directly:</strong> ${request.userEmail || "No reply email provided"}</p>
        `,
      });

      request.emailDelivery = emailResult;
      requests[0] = request;
      await writeCollection("requests", requests);

      res.status(201).json({ request, emailResult });
    } catch (error) {
      res.status(500).json({ error: "Failed to create mentor request." });
    }
  });

  app.patch("/api/mentor-requests/:requestId/status", async (req, res) => {
    try {
      const requests = await readCollection("requests", []);
      const index = requests.findIndex(
        (request) => request.id === req.params.requestId,
      );
      if (index === -1) {
        return res.status(404).json({ error: "Request not found." });
      }

      requests[index] = {
        ...requests[index],
        status: req.body.status || requests[index].status,
        updatedAt: new Date().toISOString(),
      };
      await writeCollection("requests", requests);

      const notifications = await readCollection("notifications", []);
      notifications.unshift({
        id: createId("notif"),
        userId: requests[index].userId,
        mentorId: requests[index].mentorId,
        requestId: requests[index].id,
        type: "request_status_changed",
        status: "unread",
        message: `Request status updated to ${requests[index].status}.`,
        createdAt: new Date().toISOString(),
      });
      await writeCollection("notifications", notifications);

      res.json({ request: requests[index] });
    } catch (error) {
      res.status(500).json({ error: "Failed to update request status." });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await readCollection("notifications", []);
      const filtered = notifications.filter((notification) => {
        if (req.query.userId && notification.userId === req.query.userId) {
          return true;
        }
        if (req.query.mentorId && notification.mentorId === req.query.mentorId) {
          return true;
        }
        return !req.query.userId && !req.query.mentorId;
      });
      res.json({ notifications: filtered.slice(0, 20) });
    } catch (error) {
      res.status(500).json({ error: "Failed to load notifications." });
    }
  });

  app.patch("/api/notifications/:notificationId/read", async (req, res) => {
    try {
      const notifications = await readCollection("notifications", []);
      const updated = notifications.map((notification) =>
        notification.id === req.params.notificationId
          ? { ...notification, status: "read" }
          : notification,
      );
      await writeCollection("notifications", updated);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update notification." });
    }
  });

  app.get("/api/chat/:roomId", async (req, res) => {
    try {
      const messages = await readCollection("chats", []);
      const roomMessages = messages
        .filter((message) => message.roomId === req.params.roomId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      res.json({ messages: roomMessages });
    } catch (error) {
      res.status(500).json({ error: "Failed to load chat messages." });
    }
  });

  app.post("/api/chat/:roomId/messages", async (req, res) => {
    try {
      const message = {
        id: createId("chat"),
        roomId: req.params.roomId,
        senderId: req.body.senderId?.trim(),
        senderRole: req.body.senderRole?.trim() || "user",
        text: req.body.text?.trim(),
        createdAt: new Date().toISOString(),
      };

      if (!message.senderId || !message.text) {
        return res.status(400).json({ error: "Missing chat message details." });
      }

      const messages = await readCollection("chats", []);
      messages.push(message);
      await writeCollection("chats", messages);
      res.status(201).json({ message });
    } catch (error) {
      res.status(500).json({ error: "Failed to send chat message." });
    }
  });
}

module.exports = {
  registerMentorRoutes,
};
