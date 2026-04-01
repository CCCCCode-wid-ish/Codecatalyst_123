import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import "./App.css";

const API = "http://localhost:5000";
const DNA = ["Logic Errors", "Syntax", "Edge Cases", "Complexity", "Data Structures", "Null Handling"];
const MENTEE_NAV = [
  { to: "/home", label: "Home" },
  { to: "/submit", label: "Submit" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/problems", label: "Problems" },
  { to: "/challenge", label: "Challenge" },
  { to: "/teachback", label: "TeachBack" },
];
const MENTOR_NAV = [
  { to: "/home", label: "Mentor Home" },
  { to: "/mentor-requests", label: "Requests" },
];
const userId = (() => {
  const existing = localStorage.getItem("mentorUserId");
  if (existing) return existing;
  const created = `user-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem("mentorUserId", created);
  return created;
})();

function getOwnedMentors(allMentors, authUser) {
  const normalizedEmail = authUser?.email?.trim().toLowerCase();
  const normalizedName = authUser?.name?.trim().toLowerCase();
  return (allMentors || []).filter((mentor) => {
    const mentorEmail = mentor.email?.trim().toLowerCase();
    const mentorName = mentor.name?.trim().toLowerCase();
    return (normalizedEmail && mentorEmail === normalizedEmail)
      || (normalizedName && mentorName === normalizedName);
  });
}

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
    workspace: authUser?.activeWorkspace || "mentee",
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
      activeWorkspace: form.workspace,
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
            <div className="input-group">
              <label>Workspace</label>
              <select
                value={form.workspace}
                onChange={(e) =>
                  setForm((current) => ({ ...current, workspace: e.target.value }))
                }
                className="filter-select"
              >
                <option value="mentee">Mentee Workspace</option>
                <option value="mentor">Mentor Workspace</option>
              </select>
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

function MenteeHome({ authUser }) {
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
          <p className="eyebrow">Mentee Workspace</p>
          <h1>Find the right mentor and keep your learning moving</h1>
          <p className="hero-sub">Discover recommended mentors, send focused guidance requests, and continue each mentorship conversation in one place.</p>
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
        <div className="flex-row space-between">
          <div>
            <h3>Mentor Directory</h3>
            <p className="text-muted">
              Explore the full mentor list beyond the AI-matched recommendations.
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
          <div className="problem-card">
            {!roomId ? (
              <p>No chat selected yet.</p>
            ) : chatMessages.length === 0 ? (
              <p>Chat is open. No messages yet, so send the first one below.</p>
            ) : (
              chatMessages.map((m) => <div key={m.id} className="timeline-item"><strong>{m.senderRole}:</strong> {m.text}</div>)
            )}
          </div>
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

function MentorHome({ authUser }) {
  const navigate = useNavigate();
  const [mentors, setMentors] = useState([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [mentorCreateFeedback, setMentorCreateFeedback] = useState("");
  const [mentorForm, setMentorForm] = useState({
    name: authUser?.name || "",
    role: "",
    company: "",
    skills: "",
    experience: "Intermediate",
    email: authUser?.email || "",
    availability: "",
    bio: "",
  });

  const loadMentorHome = async () => {
    try {
      const mentorRes = await fetch(`${API}/api/mentors`);
      const mentorData = await mentorRes.json();
      const ownedMentors = getOwnedMentors(mentorData.mentors || [], authUser);
      setMentors(ownedMentors);

      const nextMentorId = selectedMentorId || ownedMentors[0]?.id || "";
      setSelectedMentorId(nextMentorId);

      if (!nextMentorId) {
        setRequests([]);
        setNotifications([]);
        return;
      }

      const [requestRes, notificationRes] = await Promise.all([
        fetch(`${API}/api/mentor-requests?mentorId=${nextMentorId}`),
        fetch(`${API}/api/notifications?mentorId=${nextMentorId}`),
      ]);
      const requestData = await requestRes.json();
      const notificationData = await notificationRes.json();
      setRequests(requestData.requests || []);
      setNotifications(notificationData.notifications || []);
    } catch {
      setMentors([]);
      setRequests([]);
      setNotifications([]);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      loadMentorHome();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!selectedMentorId) return;
    const id = setTimeout(async () => {
      try {
        const [requestRes, notificationRes] = await Promise.all([
          fetch(`${API}/api/mentor-requests?mentorId=${selectedMentorId}`),
          fetch(`${API}/api/notifications?mentorId=${selectedMentorId}`),
        ]);
        const requestData = await requestRes.json();
        const notificationData = await notificationRes.json();
        setRequests(requestData.requests || []);
        setNotifications(notificationData.notifications || []);
      } catch {
        setRequests([]);
        setNotifications([]);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [selectedMentorId]);

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

      setMentorCreateFeedback("Mentor profile created successfully.");
      setMentorForm((current) => ({
        ...current,
        role: "",
        company: "",
        skills: "",
        experience: "Intermediate",
        availability: "",
        bio: "",
      }));
      await loadMentorHome();
    } catch {
      setMentorCreateFeedback("Backend unavailable. Mentor profile was not created.");
    }
  };

  const selectedMentor = mentors.find((mentor) => mentor.id === selectedMentorId) || null;

  return (
    <div className="page">
      <section className="workspace-banner glass">
        <div>
          <p className="eyebrow">Mentor Workspace</p>
          <h1>Run your mentor desk professionally</h1>
          <p className="hero-sub">
            Keep your mentor profile polished, review incoming mentee requests,
            and jump into one-to-one conversations from a dedicated workspace.
          </p>
        </div>
        <div className="workspace-actions">
          <button className="outline-btn" onClick={loadMentorHome}>Refresh Workspace</button>
          <button className="submit-btn" onClick={() => navigate("/mentor-requests")}>Open Requests</button>
        </div>
      </section>

      <section className="dashboard-cards">
        <div className="mini-card">
          <h4>Your Profiles</h4>
          <p>{mentors.length}</p>
          <small>Mentor identities linked to this login</small>
        </div>
        <div className="mini-card">
          <h4>Pending</h4>
          <p>{requests.filter((request) => request.status === "pending").length}</p>
          <small>Requests waiting for action</small>
        </div>
        <div className="mini-card">
          <h4>Accepted</h4>
          <p>{requests.filter((request) => request.status === "accepted").length}</p>
          <small>Active mentor conversations</small>
        </div>
        <div className="mini-card">
          <h4>Unread</h4>
          <p>{notifications.filter((notification) => notification.status === "unread").length}</p>
          <small>Mentor-side alerts</small>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="glass card">
          <div className="flex-row space-between">
            <div>
              <h3>Mentor Control Center</h3>
              <p className="text-muted">
                Pick one of your mentor profiles to review its live request queue.
              </p>
            </div>
            <select
              value={selectedMentorId}
              onChange={(e) => setSelectedMentorId(e.target.value)}
              className="filter-select"
            >
              <option value="">Select your mentor profile</option>
              {mentors.map((mentor) => (
                <option key={mentor.id} value={mentor.id}>
                  {mentor.name} - {mentor.role}
                </option>
              ))}
            </select>
          </div>

          {selectedMentor ? (
            <div className="mentor-profile-card">
              <div className="mentor-top">
                <div className="avatar">{selectedMentor.name?.[0] || "M"}</div>
                <div>
                  <h4>{selectedMentor.name}</h4>
                  <p>{selectedMentor.role} at {selectedMentor.company}</p>
                </div>
              </div>
              <p className="text-muted">
                Availability: {selectedMentor.availability || "Not shared yet"} | Experience: {selectedMentor.experience}
              </p>
              <div className="skill-row">
                {(selectedMentor.skills || []).map((skill) => (
                  <span key={`${selectedMentor.id}-${skill}`} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted">
              No mentor profile linked to this login yet. Create one below to start accepting mentees.
            </p>
          )}

          <div className="problem-grid">
            {requests.slice(0, 3).map((request) => (
              <article key={request.id} className="problem-card">
                <h5>{request.userName}</h5>
                <p>Status: {request.status}</p>
                <p>{request.message}</p>
              </article>
            ))}
            {selectedMentorId && requests.length === 0 && (
              <p className="text-muted">No requests have reached this mentor profile yet.</p>
            )}
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
            <textarea rows={4} value={mentorForm.bio} onChange={(e) => setMentorForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Bio" />
            <button className="submit-btn">Create Mentor Profile</button>
            {mentorCreateFeedback && <p className="text-muted" style={{ marginTop: "0.75rem" }}>{mentorCreateFeedback}</p>}
          </form>
        </section>
      </div>

      <section className="glass card">
        <div className="flex-row space-between">
          <div>
            <h3>Mentor Notifications</h3>
            <p className="text-muted">
              Live alerts for requests and status changes tied to your selected mentor profile.
            </p>
          </div>
          <button className="outline-btn" onClick={() => navigate("/mentor-requests")}>Manage Requests</button>
        </div>
        <ul>
          {notifications.length === 0 && <li>No mentor notifications yet.</li>}
          {notifications.map((notification) => (
            <li key={notification.id}>
              {notification.message} ({notification.status})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Submit({ setFeedback, setSessionCount, setMistakeDNA, setConfidence, setTimeline, setChecklist, setChallenge }) {
  const location = useLocation();
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

  useEffect(() => {
    const selectedProblem = location.state?.selectedProblem;
    if (!selectedProblem) return;

    const formattedProblem = [
      `Title: ${selectedProblem.title}`,
      `Source: ${selectedProblem.source}`,
      `Difficulty: ${selectedProblem.difficulty}`,
      `Topic: ${selectedProblem.topic}`,
      selectedProblem.tags?.length ? `Tags: ${selectedProblem.tags.join(", ")}` : "",
      "",
      "Problem Statement:",
      selectedProblem.description || "Paste the full problem statement here before solving.",
    ].filter(Boolean).join("\n");

    setProblem(formattedProblem);
    setSolution("");
    setFeedbackText("");
    setEli5Text("");
    setBabyStepsText("");
    setThinkingReplayText("");
    setPreflightWarnings([]);
    setChecklistLocal([]);
  }, [location.state]);

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
      const chall = await fetch(`${API}/api/personalized-contest`);
      const challData = await chall.json();
      setChallenge(challData);
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
  const navigate = useNavigate();
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
  const [loading, setLoading] = useState(false);

  const loadProblems = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      loadProblems();
    }, 0);
    return () => clearTimeout(id);
  }, [topicFilter, difficultyFilter, sourceFilter, searchQuery, problemId]);

  const openCodingWorkspace = (problem) => {
    navigate("/submit", {
      state: {
        selectedProblem: {
          ...problem,
          description: problem.description || `Solve ${problem.title} from ${problem.source} using a clean and efficient approach.`,
        },
      },
    });
  };

  const openBlankCodingWorkspace = () => {
    navigate("/submit");
  };

  const resetProblemFilters = () => {
    setSearchQuery("");
    setProblemId("");
    setTopicFilter("All");
    setDifficultyFilter("All");
    setSourceFilter("All");
  };

  const renderProblemCard = (problem, variant = "") => (
    <article
      key={`${variant}-${problem.id}`}
      className={`problem-card ${variant}`.trim()}
      onClick={() => openCodingWorkspace(problem)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openCodingWorkspace(problem);
        }
      }}
    >
      <h5>{problem.title}</h5>
      <p>{problem.source} | {problem.difficulty} | {problem.topic}</p>
      {(problem.tags || []).length > 0 && (
        <div className="tag-row">
          {(problem.tags || []).map((tag) => <span key={`${problem.id}-${tag}`} className="chip">{tag}</span>)}
        </div>
      )}
      <button
        type="button"
        className="outline-btn"
        onClick={(e) => {
          e.stopPropagation();
          openCodingWorkspace(problem);
        }}
      >
        Start Coding
      </button>
    </article>
  );

  return (
    <div className="panel problems-panel">
      <h2>Practice Problem Dashboard</h2>
      <div className="filter-row">
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search title or keyword" className="filter-select" />
        <input value={problemId} onChange={(e) => setProblemId(e.target.value)} placeholder="Problem ID" className="filter-select" />
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="filter-select"><option>All</option><option>Arrays</option><option>String</option><option>Linked List</option><option>Dynamic Programming</option><option>Tree</option><option>Graph</option></select>
        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="filter-select"><option>All</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setProblemId(""); }} className="filter-select"><option>All</option><option>LeetCode</option><option>GeeksforGeeks</option><option>CodeChef</option><option>Codeforces</option></select>
        <button type="button" className="outline-btn" onClick={resetProblemFilters}>Clear Filters</button>
        <button type="button" className="submit-btn" onClick={openBlankCodingWorkspace}>Open Coding Page</button>
      </div>
      <p className="text-muted">Weak topics from Hindsight: {weakTopics.join(", ") || "None yet"}</p>
      {loading && <p className="text-muted">Loading problems from platform sources...</p>}
      <div className="dashboard-cards">{sourceStats.length === 0 ? <div className="mini-card"><h4>Source Status</h4><small>{loading ? "Loading platform data..." : "No platform data loaded yet."}</small></div> : sourceStats.map((stat) => <div key={stat.source} className="mini-card"><h4>{stat.source}</h4><p>{stat.count}</p><small>{stat.mode === "live" ? "Live fetch" : "Fallback"} | {stat.note}</small></div>)}</div>
      <div className="problem-section"><h4>Recommended for you</h4><div className="problem-grid">{recommended.length === 0 ? <p>No recommended problems right now.</p> : recommended.map((p) => renderProblemCard(p, "recommended"))}</div></div>
      <div className="problem-section"><h4>Practice again</h4><div className="problem-grid">{practiceAgain.length === 0 ? <p>No practice-again items yet.</p> : practiceAgain.map((p) => renderProblemCard(p, "practice-again"))}</div></div>
      <div className="problem-section"><h4>All problems</h4><div className="problem-grid">{problems.length === 0 ? <div className="mini-card"><p>No problems match current filters.</p><div className="filter-row" style={{ marginTop: "0.75rem" }}><button type="button" className="outline-btn" onClick={resetProblemFilters}>Clear Filters</button><button type="button" className="submit-btn" onClick={openBlankCodingWorkspace}>Go To Coding Page</button></div></div> : problems.map((p) => renderProblemCard(p))}</div></div>
    </div>
  );
}

function MentorRequests({ authUser }) {
  const navigate = useNavigate();
  const [mentors, setMentors] = useState([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const loadMentorWorkspace = async (mentorId) => {
    if (!mentorId) {
      setRequests([]);
      setNotifications([]);
      setActiveRequestId("");
      setRoomId("");
      setChatMessages([]);
      return;
    }

    setLoading(true);
    try {
      const [requestRes, notificationRes] = await Promise.all([
        fetch(`${API}/api/mentor-requests?mentorId=${mentorId}`),
        fetch(`${API}/api/notifications?mentorId=${mentorId}`),
      ]);
      const requestData = await requestRes.json();
      const notificationData = await notificationRes.json();
      setRequests(requestData.requests || []);
      setNotifications(notificationData.notifications || []);
    } catch {
      setRequests([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
      const id = setTimeout(async () => {
        try {
          const res = await fetch(`${API}/api/mentors`);
          const data = await res.json();
          const loadedMentors = getOwnedMentors(data.mentors || [], authUser);
          setMentors(loadedMentors);
          if (loadedMentors.length > 0) {
            setSelectedMentorId((current) => current || loadedMentors[0].id);
          }
        } catch {
          setMentors([]);
        }
      }, 0);
      return () => clearTimeout(id);
    }, [authUser]);

  useEffect(() => {
    const id = setTimeout(() => {
      loadMentorWorkspace(selectedMentorId);
    }, 0);
    return () => clearTimeout(id);
  }, [selectedMentorId]);

  useEffect(() => {
    setActiveRequestId("");
    setRoomId("");
    setChatMessages([]);
    setChatText("");
    setStatusMessage("");
  }, [selectedMentorId]);

  const updateRequestStatus = async (requestId, status) => {
    try {
      const res = await fetch(`${API}/api/mentor-requests/${requestId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || "Could not update request status.");
        return;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === requestId ? data.request : request,
        ),
      );
      setStatusMessage(`Request marked as ${status}.`);
      await loadMentorWorkspace(selectedMentorId);
    } catch {
      setStatusMessage("Backend unavailable. Status not updated.");
    }
  };

  const loadChat = async (nextRoomId) => {
    if (!nextRoomId) {
      setChatMessages([]);
      return;
    }

    try {
      const res = await fetch(`${API}/api/chat/${nextRoomId}`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch {
      setChatMessages([]);
    }
  };

  const openMentorChat = async (request) => {
    if (!request?.roomId) {
      setStatusMessage("This request does not have a chat room yet.");
      return;
    }
    if (request.status !== "accepted") {
      setStatusMessage("Accept the request before opening chat.");
      return;
    }

    setActiveRequestId(request.id);
    setRoomId(request.roomId);
    setStatusMessage(`Chat opened with ${request.userName}.`);
    await loadChat(request.roomId);
    navigate(`/mentor-chat/${request.mentorId}/${request.id}`);
  };

  useEffect(() => {
    if (!roomId) return;
    const id = setTimeout(() => {
      loadChat(roomId);
    }, 0);
    const intervalId = setInterval(() => loadChat(roomId), 4000);
    return () => {
      clearTimeout(id);
      clearInterval(intervalId);
    };
  }, [roomId]);

  const sendMentorReply = async () => {
    if (!roomId) {
      setStatusMessage("Open chat from an accepted request before replying.");
      return;
    }
    if (!chatText.trim() || !selectedMentorId) return;
    try {
      await fetch(`${API}/api/chat/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: selectedMentorId,
          senderRole: "mentor",
          text: chatText,
        }),
      });
      setChatText("");
      setStatusMessage("Reply sent.");
      await loadChat(roomId);
    } catch {
      setStatusMessage("Could not send mentor reply.");
      }
    };

  const selectedMentor = mentors.find((mentor) => mentor.id === selectedMentorId);
  const activeRequest = requests.find((request) => request.id === activeRequestId)
    || requests.find((request) => request.roomId === roomId);

  return (
    <div className="panel">
      <div className="flex-row space-between">
        <div>
          <h2>Mentor Requests</h2>
          <p className="text-muted">
            Select a mentor profile and approve or reject incoming requests.
          </p>
        </div>
        <div className="filter-row">
          <select
            value={selectedMentorId}
            onChange={(e) => setSelectedMentorId(e.target.value)}
            className="filter-select"
          >
            <option value="">Select mentor</option>
            {mentors.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.name}
              </option>
            ))}
          </select>
          <button className="outline-btn" onClick={() => loadMentorWorkspace(selectedMentorId)}>
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-cards">
        <div className="mini-card">
          <h4>Selected Mentor</h4>
          <p>{selectedMentor ? selectedMentor.name : "--"}</p>
          <small>{selectedMentor?.company || "Choose a mentor profile"}</small>
        </div>
        <div className="mini-card">
          <h4>Pending</h4>
          <p>{requests.filter((request) => request.status === "pending").length}</p>
          <small>Requests waiting for review</small>
        </div>
        <div className="mini-card">
          <h4>Accepted</h4>
          <p>{requests.filter((request) => request.status === "accepted").length}</p>
          <small>Approved mentorship requests</small>
        </div>
        <div className="mini-card">
          <h4>Unread Alerts</h4>
          <p>{notifications.filter((item) => item.status === "unread").length}</p>
          <small>Mentor-side notifications</small>
        </div>
      </div>

      {statusMessage && <p className="text-muted">{statusMessage}</p>}

      <section className="glass card">
        <h3>Incoming Requests</h3>
        <div className="problem-grid">
          {!selectedMentorId && <p>Select a mentor to view requests.</p>}
          {selectedMentorId && !loading && requests.length === 0 && (
            <p>No requests for this mentor yet.</p>
          )}
          {requests.map((request) => (
            <article key={request.id} className="problem-card">
              <h5>{request.userName}</h5>
              <p>Status: {request.status}</p>
              <p>{request.message}</p>
              <div className="tag-row">
                {(request.userWeaknesses || []).map((weakness) => (
                  <span key={`${request.id}-${weakness}`} className="chip">
                    {weakness}
                  </span>
                ))}
              </div>
              <div className="filter-row">
                <button
                  className="outline-btn"
                  onClick={() => updateRequestStatus(request.id, "accepted")}
                  disabled={request.status === "accepted"}
                >
                  Accept
                </button>
                <button
                  className="outline-btn"
                  onClick={() => updateRequestStatus(request.id, "rejected")}
                  disabled={request.status === "rejected"}
                >
                  Reject
                </button>
                  <button
                    className="outline-btn"
                    onClick={() => openMentorChat(request)}
                    disabled={!request.roomId || request.status !== "accepted"}
                  >
                    Open Chat
                  </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h3>Mentor Notifications</h3>
        <ul>
          {notifications.length === 0 && <li>No notifications yet.</li>}
          {notifications.map((notification) => (
            <li key={notification.id}>
              {notification.message} ({notification.status})
            </li>
          ))}
        </ul>
      </section>

        <section className="glass card">
          <h3>Mentor Reply</h3>
          <p className="text-muted">
            Active room: {roomId || "Select an accepted request and click Open Chat"}
          </p>
        {activeRequest ? (
          <p className="text-muted">
            Replying to {activeRequest.userName} for request status {activeRequest.status}.
          </p>
        ) : (
          <p className="text-muted">
            You must open chat from an accepted request before sending a reply.
          </p>
          )}
          <div className="problem-card">
            {!roomId ? (
              <p>No chat selected yet.</p>
            ) : chatMessages.length === 0 ? (
              <p>Chat opened successfully. No messages yet, so you can send the first reply now.</p>
            ) : (
              chatMessages.map((message) => (
                <div key={message.id} className="timeline-item">
                  <strong>{message.senderRole}:</strong> {message.text}
                </div>
            ))
          )}
        </div>
        <div className="filter-row" style={{ marginTop: "0.8rem" }}>
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Reply to the mentee"
            className="filter-select"
            style={{ flex: 1 }}
          />
          <button className="outline-btn" onClick={sendMentorReply} disabled={!roomId}>
            Send Reply
          </button>
        </div>
      </section>
    </div>
  );
}

function MentorChatPage() {
  const navigate = useNavigate();
  const { mentorId, requestId } = useParams();
  const [mentor, setMentor] = useState(null);
  const [request, setRequest] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadChatContext = async () => {
    if (!mentorId || !requestId) return;

    setLoading(true);
    try {
      const [mentorRes, requestRes] = await Promise.all([
        fetch(`${API}/api/mentors`),
        fetch(`${API}/api/mentor-requests?mentorId=${mentorId}`),
      ]);
      const mentorData = await mentorRes.json();
      const requestData = await requestRes.json();
      const matchedMentor = (mentorData.mentors || []).find((item) => item.id === mentorId) || null;
      const matchedRequest = (requestData.requests || []).find((item) => item.id === requestId) || null;

      setMentor(matchedMentor);
      setRequest(matchedRequest);

      if (matchedRequest?.roomId) {
        const chatRes = await fetch(`${API}/api/chat/${matchedRequest.roomId}`);
        const chatData = await chatRes.json();
        setChatMessages(chatData.messages || []);
      } else {
        setChatMessages([]);
      }
    } catch {
      setStatusMessage("Could not load this chat.");
      setChatMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      loadChatContext();
    }, 0);
    return () => clearTimeout(id);
  }, [mentorId, requestId]);

  useEffect(() => {
    if (!request?.roomId) return;
    const intervalId = setInterval(async () => {
      try {
        const chatRes = await fetch(`${API}/api/chat/${request.roomId}`);
        const chatData = await chatRes.json();
        setChatMessages(chatData.messages || []);
      } catch {
        return;
      }
    }, 4000);
    return () => clearInterval(intervalId);
  }, [request?.roomId]);

  const sendReply = async () => {
    if (!request?.roomId) {
      setStatusMessage("This request does not have an active room.");
      return;
    }
    if (request.status !== "accepted") {
      setStatusMessage("Accept the request before replying.");
      return;
    }
    if (!chatText.trim()) return;

    try {
      await fetch(`${API}/api/chat/${request.roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: mentorId,
          senderRole: "mentor",
          text: chatText,
        }),
      });
      setChatText("");
      setStatusMessage("Reply sent.");
      await loadChatContext();
    } catch {
      setStatusMessage("Could not send the reply.");
    }
  };

  return (
    <div className="panel">
      <div className="flex-row space-between">
        <div>
          <h2>Mentor Chat</h2>
          <p className="text-muted">
            Dedicated conversation with the mentee for this accepted request.
          </p>
        </div>
        <button className="outline-btn" onClick={() => navigate("/mentor-requests")}>
          Back To Requests
        </button>
      </div>

      <div className="dashboard-cards">
        <div className="mini-card">
          <h4>Mentor</h4>
          <p>{mentor?.name || "--"}</p>
          <small>{mentor?.company || "Mentor profile"}</small>
        </div>
        <div className="mini-card">
          <h4>Mentee</h4>
          <p>{request?.userName || "--"}</p>
          <small>{request?.userEmail || "Selected request user"}</small>
        </div>
        <div className="mini-card">
          <h4>Status</h4>
          <p>{request?.status || "--"}</p>
          <small>Current mentorship request state</small>
        </div>
        <div className="mini-card">
          <h4>Room</h4>
          <p>{request?.roomId ? "Ready" : "--"}</p>
          <small>{request?.roomId || "No room id yet"}</small>
        </div>
      </div>

      {request && (
        <section className="glass card">
          <h3>Request Summary</h3>
          <p>{request.message}</p>
          <div className="tag-row">
            {(request.userWeaknesses || []).map((weakness) => (
              <span key={`${request.id}-${weakness}`} className="chip">
                {weakness}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="glass card">
        <div className="flex-row space-between">
          <h3>Conversation</h3>
          <button className="outline-btn" onClick={loadChatContext}>
            Refresh Chat
          </button>
        </div>
        {statusMessage && <p className="text-muted">{statusMessage}</p>}
        <div className="problem-card">
          {loading ? (
            <p>Loading chat...</p>
          ) : !request ? (
            <p>Request not found for this mentor.</p>
          ) : chatMessages.length === 0 ? (
            <p>Chat is open. No messages yet, so you can send the first reply now.</p>
          ) : (
            chatMessages.map((message) => (
              <div key={message.id} className="timeline-item">
                <strong>{message.senderRole}:</strong> {message.text}
              </div>
            ))
          )}
        </div>
        <div className="filter-row" style={{ marginTop: "0.8rem" }}>
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Reply to the mentee"
            className="filter-select"
            style={{ flex: 1 }}
          />
          <button className="outline-btn" onClick={sendReply} disabled={!request || request.status !== "accepted"}>
            Send Reply
          </button>
        </div>
      </section>
    </div>
  );
}

function Challenge({ challengeData, fetchChallenge, onContestComplete }) {
  const contest = challengeData?.contest;
  const [answers, setAnswers] = useState({});
  const [hasStarted, setHasStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [scoreResult, setScoreResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    if (!contest) return;
    setAnswers(
      Object.fromEntries(
        (contest.questions || []).map((question) => [question.id, ""]),
      ),
    );
    setHasStarted(false);
    setSecondsLeft((contest.durationMinutes || 45) * 60);
    setScoreResult(null);
    setAutoSubmitted(false);
  }, [contest]);

  useEffect(() => {
    if (!hasStarted || secondsLeft <= 0) return;
    const intervalId = setInterval(() => {
      setSecondsLeft((current) => current - 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [hasStarted, secondsLeft]);

  const formatTime = (totalSeconds) => {
    const safeSeconds = Math.max(totalSeconds, 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const submitContest = async () => {
    if (!contest) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/personalized-contest/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contest,
          submissions: (contest.questions || []).map((question) => ({
            id: question.id,
            answer: answers[question.id] || "",
          })),
          timeSpentMinutes:
            (contest.durationMinutes || 45) - Math.floor(secondsLeft / 60),
        }),
      });
      const data = await res.json();
      setScoreResult(data);
      setHasStarted(false);
      onContestComplete?.(data);
    } catch {
      setScoreResult({
        score: 0,
        feedback: "Contest scoring is unavailable right now.",
        perQuestion: [],
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!hasStarted || secondsLeft > 0 || submitting || autoSubmitted) return;
    setAutoSubmitted(true);
    submitContest();
  }, [autoSubmitted, hasStarted, secondsLeft, submitting]);

  return (
    <div className="panel">
      <div className="flex-row space-between">
        <div>
          <h2>Personalized Contest</h2>
          <p className="text-muted">
            A Hindsight-based contest generated from your topics covered, mistakes, and weak areas.
          </p>
        </div>
        <button className="outline-btn" onClick={fetchChallenge}>
          Regenerate Contest
        </button>
      </div>

      {!contest ? (
        <p>Loading contest...</p>
      ) : (
        <>
          <div className="dashboard-cards">
            <div className="mini-card">
              <h4>Questions</h4>
              <p>{contest.questions?.length || 0}</p>
              <small>Adaptive easy to hard flow</small>
            </div>
            <div className="mini-card">
              <h4>Timer</h4>
              <p>{formatTime(secondsLeft)}</p>
              <small>{contest.durationMinutes} minute contest</small>
            </div>
            <div className="mini-card">
              <h4>Weak Areas</h4>
              <p>{contest.generatedFrom?.weakAreas?.length || 0}</p>
              <small>{(contest.generatedFrom?.weakAreas || []).join(", ") || "No weak areas found"}</small>
            </div>
            <div className="mini-card">
              <h4>Learning Days</h4>
              <p>{contest.generatedFrom?.learningDays || 5}</p>
              <small>Built from Hindsight memory</small>
            </div>
          </div>

          <section className="glass card">
            <h3>{contest.title}</h3>
            <p className="text-muted">
              Topics covered: {(contest.generatedFrom?.topicsCovered || []).join(", ") || "General practice"}
            </p>
            <p className="text-muted">
              Past mistakes used: {(contest.generatedFrom?.mistakesMade || []).join(", ") || "Repeated beginner mistakes"}
            </p>
            <div className="filter-row" style={{ marginTop: "0.8rem" }}>
              <button className="submit-btn" onClick={() => { setHasStarted(true); }} disabled={hasStarted}>
                {hasStarted ? "Contest Running" : "Start Contest"}
              </button>
              <button className="outline-btn" onClick={submitContest} disabled={submitting}>
                {submitting ? "Scoring..." : "Submit Contest"}
              </button>
            </div>
          </section>

          <div className="problem-grid">
            {(contest.questions || []).map((question, index) => (
              <article key={question.id} className="problem-card">
                <h5>{index + 1}. {question.title}</h5>
                <p>{question.difficulty} | {question.topic}</p>
                <p>{question.prompt}</p>
                <p className="text-muted">Targets: {question.focusMistake}</p>
                <p className="text-muted">Expected outcome: {question.expectedOutcome}</p>
                <textarea
                  rows={6}
                  value={answers[question.id] || ""}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: e.target.value,
                    }))
                  }
                  placeholder="Write your solution approach or code here"
                />
              </article>
            ))}
          </div>

          {scoreResult && (
            <section className="glass card">
              <h3>Contest Score</h3>
              {autoSubmitted && (
                <p className="text-muted">Timer expired, so the contest was submitted automatically.</p>
              )}
              <p><strong>{scoreResult.score}%</strong></p>
              <p>{scoreResult.feedback}</p>
              <ul>
                {(scoreResult.perQuestion || []).map((item) => (
                  <li key={item.id}>
                    {item.title}: {item.score}% - {item.feedback}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
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

function ProtectedRoute({ authUser, allowedWorkspaces, contestLocked = false, allowBeforeContest = false, children }) {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }
  if (allowedWorkspaces && !allowedWorkspaces.includes(authUser.activeWorkspace || "mentee")) {
    return <Navigate to="/home" replace />;
  }
  if (
    contestLocked &&
    (authUser.activeWorkspace || "mentee") === "mentee" &&
    !allowBeforeContest
  ) {
    return <Navigate to="/challenge" replace />;
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
  const [challenge, setChallenge] = useState(null);
  const [teachBackConcept, setTeachBackConcept] = useState("null handling");
  const [teachBackExplanation, setTeachBackExplanation] = useState("");
  const [teachBackScore, setTeachBackScore] = useState(null);
  const [teachBackResult, setTeachBackResult] = useState("");
  const [sessionCount, setSessionCount] = useState(0);
  const [contestGateStatus, setContestGateStatus] = useState("locked");
  const activeWorkspace = authUser?.activeWorkspace || "mentee";
  const contestThresholdReached = timeline.length >= 5;
  const menteeContestLocked =
    !!authUser &&
    activeWorkspace === "mentee" &&
    contestThresholdReached &&
    contestGateStatus !== "completed";
  const navItems =
    activeWorkspace === "mentor"
      ? MENTOR_NAV
      : MENTEE_NAV;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!authUser?.email) {
        setContestGateStatus("locked");
        return;
      }
      const savedStatus = localStorage.getItem(
        `contestGate:${authUser.email.toLowerCase()}`,
      );
      setContestGateStatus(savedStatus || "locked");
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [authUser]);

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
        const challRes = await fetch(`${API}/api/personalized-contest`);
        const chall = await challRes.json();
        setChallenge(chall);
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

  const switchWorkspace = (nextWorkspace) => {
    if (!authUser) return;
    const updatedUser = { ...authUser, activeWorkspace: nextWorkspace };
    localStorage.setItem("mentorAuthUser", JSON.stringify(updatedUser));
    setAuthUser(updatedUser);
  };

  const logout = () => {
    localStorage.removeItem("mentorAuthUser");
    setAuthUser(null);
  };

  const markContestCompleted = () => {
    if (!authUser?.email) return;
    localStorage.setItem(
      `contestGate:${authUser.email.toLowerCase()}`,
      "completed",
    );
    setContestGateStatus("completed");
  };

  return (
    <Router>
      <div className="container">
        <header className="header app-shell-header glass">
          <div className="header-left">
            <div className="nav-icon">AI</div>
            <div className="logo-row">
              <div className="logo-icon"></div>
              <div>
                <h1>AI Coding Mentor</h1>
                <p>{activeWorkspace === "mentor" ? "Mentor Operations Workspace" : "Learner Growth Workspace"}</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            {authUser && (
              <div className="workspace-switcher">
                <button className={activeWorkspace === "mentee" ? "workspace-pill active" : "workspace-pill"} onClick={() => switchWorkspace("mentee")}>
                  Mentee
                </button>
                <button className={activeWorkspace === "mentor" ? "workspace-pill active" : "workspace-pill"} onClick={() => switchWorkspace("mentor")}>
                  Mentor
                </button>
              </div>
            )}
            <nav className="top-nav">
              <NavLink to="/login" className="nav-link">Login</NavLink>
              {authUser && navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {authUser && <button className="outline-btn" onClick={logout}>Logout</button>}
          </div>
        </header>
        <div className="session-info workspace-status glass">
          <span>{sessionCount} sessions</span>
          <span>Confidence {confidence}%</span>
          <span>{authUser ? `Signed in as ${authUser.name}` : "Not logged in"}</span>
          <span>Workspace: {activeWorkspace === "mentor" ? "Mentor" : "Mentee"}</span>
          {menteeContestLocked && <span>Contest lock active</span>}
        </div>
        {menteeContestLocked && (
          <div className="panel" style={{ marginBottom: "1rem", borderColor: "rgba(56,189,248,0.45)" }}>
            <h3 style={{ marginTop: 0 }}>Workspace Locked</h3>
            <p style={{ marginBottom: 0 }}>
              You have completed 5 learning days. Take the personalized contest in <strong>Challenge</strong> to unlock the rest of the mentee workspace.
            </p>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/home" element={<ProtectedRoute authUser={authUser} contestLocked={menteeContestLocked}>{activeWorkspace === "mentor" ? <MentorHome key={`${authUser?.email || "guest"}-mentor`} authUser={authUser} /> : <MenteeHome key={`${authUser?.email || "guest"}-mentee`} authUser={authUser} />}</ProtectedRoute>} />
          <Route path="/mentor-requests" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentor"]}><MentorRequests authUser={authUser} /></ProtectedRoute>} />
          <Route path="/mentor-chat/:mentorId/:requestId" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentor"]}><MentorChatPage /></ProtectedRoute>} />
          <Route path="/login" element={<Login authUser={authUser} setAuthUser={setAuthUser} />} />
          <Route path="/submit" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentee"]} contestLocked={menteeContestLocked}><Submit setFeedback={() => {}} setSessionCount={setSessionCount} setMistakeDNA={setMistakeDNA} setConfidence={setConfidence} setTimeline={setTimeline} setChecklist={setChecklist} setChallenge={setChallenge} /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentee"]} contestLocked={menteeContestLocked}><Dashboard mistakeDNA={mistakeDNA} confidence={confidence} timeline={timeline} checklist={checklist} topicsLearned={topicsLearned} totalMistakes={totalMistakes} timeTaken={timeTaken} improvementRate={improvementRate} weakAreas={weakAreas} strongAreas={strongAreas} progressGraph={progressGraph} improvementInsights={improvementInsights} /></ProtectedRoute>} />
          <Route path="/problems" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentee"]} contestLocked={menteeContestLocked}><Problems /></ProtectedRoute>} />
          <Route path="/challenge" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentee"]} contestLocked={menteeContestLocked} allowBeforeContest><Challenge challengeData={challenge} fetchChallenge={async () => { const res = await fetch(`${API}/api/personalized-contest`); const data = await res.json(); setChallenge(data); }} onContestComplete={markContestCompleted} /></ProtectedRoute>} />
          <Route path="/teachback" element={<ProtectedRoute authUser={authUser} allowedWorkspaces={["mentee"]} contestLocked={menteeContestLocked}><TeachBack teachBackConcept={teachBackConcept} teachBackExplanation={teachBackExplanation} setTeachBackConcept={setTeachBackConcept} setTeachBackExplanation={setTeachBackExplanation} teachBackScore={teachBackScore} teachBackResult={teachBackResult} evaluateTeachBack={evaluateTeachBack} /></ProtectedRoute>} />
        </Routes>
        <footer className="footer">Powered by Cognitive AI · Designed for Developers</footer>
      </div>
    </Router>
  );
}

export default App;
