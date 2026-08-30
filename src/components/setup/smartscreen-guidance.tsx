import Image from "next/image";
import { existsSync } from "node:fs";
import path from "node:path";

export function SmartScreenGuidance({
  imagePath,
  checksum,
  exceptionExpiresAt,
}: {
  imagePath: string;
  checksum: string;
  exceptionExpiresAt: string;
}) {
  const publicPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  const exists = existsSync(
    /* turbopackIgnore: true */ path.join(process.cwd(), "public", publicPath.slice(1)),
  );

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
        Windows SmartScreen will appear once
      </p>
      <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
        This internal installer is unsigned. Continue only when its SHA-256 is exactly{" "}
        <code className="break-all">{checksum}</code> and the exception has not passed{" "}
        <strong>{exceptionExpiresAt}</strong>. Do not disable Defender or SmartScreen. If every value
        matches, choose <strong>More info</strong>, then <strong>Run anyway</strong>; otherwise stop and
        report an incident.
      </p>

      {exists ? (
        <Image
          src={publicPath}
          alt="Windows SmartScreen with More info and Run anyway marked"
          width={1280}
          height={720}
          className="mt-4 h-auto w-full rounded-lg border border-amber-200"
        />
      ) : (
        <div className="mt-4 rounded-lg border-2 border-dashed border-amber-500 bg-white/70 p-6 text-center dark:bg-neutral-950/40">
          <p className="font-medium text-amber-950 dark:text-amber-100">SmartScreen screenshot pending</p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Do not hand this journey to an operator until the real unsigned-installer capture is added.
          </p>
        </div>
      )}
    </section>
  );
}
