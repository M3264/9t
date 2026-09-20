"use client";
import { FormEvent, useState } from "react";

export default function Unlock({
  token,
  name,
}: {
  token: string;
  name: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      response = await fetch(`/api/public/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
    if (response.ok) location.reload();
    else {
      setError("That password is not correct.");
      setBusy(false);
    }
  };
  return (
    <form className="handoff-unlock" onSubmit={submit}>
      <small>PROTECTED ITEM</small>
      <h1>{name}</h1>
      <p>This handoff needs its password.</p>
      <input
        name="password"
        type="password"
        autoFocus
        required
        placeholder="Password"
      />
      {error && <p className="form-error">{error}</p>}
      <button className="handoff-action" disabled={busy}>
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
