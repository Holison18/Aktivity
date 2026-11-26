import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import ClassForm from "@/components/admin/ClassForm";

export default async function NewClassPage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">
          Create
          <span className="fade-line block">a new class</span>
        </h1>
        <Link href="/admin" className="btn btn-secondary btn-sm">Back to classes</Link>
      </div>
      <section className="card p-6">
        <ClassForm />
      </section>
    </div>
  );
}
