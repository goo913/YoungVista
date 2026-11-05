/** Shown in development when the Firebase settings are missing from the environment. */
export function ConfigMissingPage({ missing }: { missing: string[] }) {
  return (
    <div className="mx-auto grid max-w-lg gap-4 px-4 py-16">
      <title>Setup needed · YoungVista</title>
      <h1 className="text-xl font-semibold">Firebase settings are missing</h1>
      <p className="text-muted-foreground">
        Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code>, fill in the web
        app settings from the Firebase console, and restart the dev server. Missing:
      </p>
      <ul className="list-disc pl-6 font-mono text-sm">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
