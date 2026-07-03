import { assetPath } from "@/lib/assets";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <meta httpEquiv="refresh" content="0;url=dashboard/" />
      <div className="flex w-full max-w-md flex-col items-center rounded-md border border-[var(--border)] bg-white p-6 text-center shadow-soft">
        <img
          alt="PromoPilot 360"
          className="mb-4 h-auto w-80 max-w-full"
          src={assetPath("/brand/promopilot-360-logo.png")}
        />
        <a className="rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf/90" href="dashboard/">
          Abrir PromoPilot 360
        </a>
      </div>
    </main>
  );
}
