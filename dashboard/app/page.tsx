import { Suspense } from "react";
import { connection } from "next/server";
import { getTickets } from "@/lib/db";
import Dashboard from "@/components/dashboard";

async function Data() {
  await connection(); // read tickets fresh on every request
  const { tickets, dbFound } = await getTickets();
  return <Dashboard tickets={tickets} dbFound={dbFound} />;
}

function Skeleton() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="h-8 w-56 animate-pulse rounded bg-wash" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-wash" />
        ))}
      </div>
      <div className="mt-4 h-80 animate-pulse rounded-xl bg-wash" />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Data />
    </Suspense>
  );
}
