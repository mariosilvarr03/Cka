"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As palavras-passe nao coincidem.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { needs_password_setup: false },
    });

    setLoading(false);

    if (updateError) {
      setError("Nao foi possivel atualizar a palavra-passe.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess("Palavra-passe atualizada com sucesso. A redirecionar...");
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Nova palavra-passe
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
          placeholder="Minimo 8 caracteres"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Confirmar palavra-passe
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
          placeholder="Repetir palavra-passe"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary h-11 rounded-lg px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "A atualizar..." : "Atualizar palavra-passe"}
      </button>

      {error ? (
        <p className="rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">{error}</p>
      ) : null}

      {success ? (
        <p className="rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">{success}</p>
      ) : null}
    </form>
  );
}
