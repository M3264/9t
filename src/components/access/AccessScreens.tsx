"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { ApiError, workspaceApi as api } from "../../lib/client/workspace";
import { Brand } from "../ui/Brand";

export function SetupScreen({ done }: { done: () => void }) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [modules, setModules] = useState({
    snippets: true,
    files: true,
    links: true,
    board: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid =
    username.trim().length >= 2 &&
    password.length >= 8 &&
    password.length <= 128 &&
    setupToken.trim().length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          setupToken: setupToken.trim(),
          modules,
          exposure: "public",
        }),
      });
      done();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Setup failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="access-screen">
      <section className="access-panel">
        <Brand />
        <div className="step-index" aria-live="polite">
          STEP {step} OF 2
        </div>
        {step === 1 ? (
          <div className="access-form">
            <small>CHOOSE MODULES</small>
            <h2>Make 9t yours.</h2>
            <p>Enable only what you use. You can change this at any time.</p>
            <div className="setup-modules" role="group" aria-label="Modules">
              {Object.keys(modules).map((key, index) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={modules[key as keyof typeof modules]}
                  className={
                    modules[key as keyof typeof modules] ? "active" : ""
                  }
                  onClick={() =>
                    setModules((current) => ({
                      ...current,
                      [key]: !current[key as keyof typeof current],
                    }))
                  }
                >
                  <b>0{index + 1}</b>
                  <span>{key}</span>
                  <i>{modules[key as keyof typeof modules] ? "ON" : "OFF"}</i>
                </button>
              ))}
            </div>
            <button className="transmit" onClick={() => setStep(2)}>
              Continue <ArrowUpRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="access-form">
            <small>SECURE YOUR WORKSPACE</small>
            <h2>Create your account.</h2>
            <p>The setup key confirms that this server belongs to you.</p>
            <label>
              SETUP KEY
              <input
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                autoComplete="off"
                placeholder="From NINE_T_SETUP_TOKEN"
              />
            </label>
            <label>
              USERNAME
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                maxLength={64}
              />
            </label>
            <label>
              PASSWORD
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8–128 characters"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="transmit"
              onClick={submit}
              disabled={!valid || busy}
            >
              <ShieldCheck aria-hidden="true" />
              {busy ? "Setting up…" : "Finish setup"}
            </button>
            <button className="text-button" onClick={() => setStep(1)}>
              ← Back
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function LoginScreen({ done }: { done: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      done();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't sign in. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">

      <form className="access-form" onSubmit={submit} aria-label="Sign in to 9t">
        <Brand />
        <h1>Welcome back.</h1><p>Sign in to pick up where you left off.</p>
        <label>
          USERNAME
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={64}
          />
        </label>
        <label>
          PASSWORD
          <span className="password-field">
            <input
              autoFocus
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={128}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="transmit" disabled={busy}>
          {busy ? "Opening…" : "Open workspace"}{" "}
          <ArrowUpRight aria-hidden="true" />
        </button>
        <footer>
          <span>9t · self-hosted</span> <span>Your space, everywhere</span>
        </footer>
      </form>
    </div>
  );
}
