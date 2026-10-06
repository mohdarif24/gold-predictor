import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-muted">This page does not exist. / এই পাতাটি নেই।</p>
      <Link href="/" className="font-medium text-brass underline underline-offset-2">
        Back to Today / আজকের পাতায় ফিরুন
      </Link>
    </main>
  );
}
