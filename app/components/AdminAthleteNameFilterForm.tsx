"use client";

import { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AdminAthleteNameFilterFormProps = {
  athleteName: string;
};

export default function AdminAthleteNameFilterForm({ athleteName }: AdminAthleteNameFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("athleteName") ?? "").trim();

    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set("athleteName", value);
    } else {
      params.delete("athleteName");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("athleteName");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form onSubmit={submitFilter} className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Pesquisar atleta por nome
        <input
          type="text"
          name="athleteName"
          defaultValue={athleteName}
          placeholder="Ex: Joao"
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        />
      </label>
      <button type="submit" className="btn-ghost h-10 rounded-lg px-4 font-medium hover:bg-white">
        Pesquisar atleta
      </button>
      <button
        type="button"
        onClick={clearFilter}
        className="btn-ghost inline-flex h-10 items-center justify-center rounded-lg px-4 font-medium hover:bg-white"
      >
        Limpar
      </button>
    </form>
  );
}
