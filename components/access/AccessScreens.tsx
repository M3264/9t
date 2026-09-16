"use client";
import { FormEvent, useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { workspaceApi as api } from "../../lib/client/workspace";
import { Brand } from "../ui/Brand";

export function SetupScreen({ done }: { done: () => void }) {
  const [step, setStep] = useState(1),
    [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [setupToken, setSetupToken] = useState(""),
    [modules, setModules] = useState({
      snippets: true,
      files: true,
      links: true,
      board: true,
    }),
    [error, setError] = useState("");
  const submit = async () => {
    try {
      await api("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          setupToken,
          modules,
          exposure: "public",
        }),
      });
      done();
    } catch (value) {
      setError((value as Error).message);
    }
  };
  return (
    <div className="access-screen">
      <section className="access-poster">
        <Brand />
        <div>
          <small>YOUR SELF-HOSTED WORKSPACE</small>
          <h1>
            Put it in 9t.
            <br />
            <i>Get it anywhere.</i>
          </h1>
        </div>
        <footer>
          Private by default <span>Port 3265</span>
        </footer>
      </section>
      <section className="access-panel">
        <div className="step-index">STEP {step} OF 2</div>
        {step === 1 ? (
          <div className="access-form">
            <small>CHOOSE MODULES</small>
            <h2>Make 9t yours.</h2>
            <p>Enable only what you use. You can change this at any time.</p>
            <div className="setup-modules">
              {Object.keys(modules).map((key, index) => (
                <button
                  className={
                    modules[key as keyof typeof modules] ? "active" : ""
                  }
                  onClick={() =>
                    setModules((current) => ({
                      ...current,
                      [key]: !current[key as keyof typeof current],
                    }))
                  }
                  key={key}
                >
                  <b>0{index + 1}</b>
                  <span>{key}</span>
                  <i>{modules[key as keyof typeof modules] ? "ON" : "OFF"}</i>
                </button>
              ))}
            </div>
            <button className="transmit" onClick={() => setStep(2)}>
              Continue <ArrowUpRight />
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
                onChange={(event) => setSetupToken(event.target.value)}
              />
            </label>
            <label>
              USERNAME
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              PASSWORD
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8 characters minimum"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="transmit" onClick={submit}>
              <ShieldCheck />
              Finish setup
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
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      done();
    } catch (value) {
      setError((value as Error).message);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-grid" />
      <form onSubmit={submit}>
        <Brand />
        <div className="login-status">
          <i />
          Your server is online
        </div>
        <h1>Welcome back.</h1>
        <label>
          USERNAME
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          PASSWORD
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="transmit">
          Open workspace <ArrowUpRight />
        </button>
        <footer>
          9t.kennyy.xyz <span>Authentication required</span>
        </footer>
      </form>
    </div>
  );
}
