// Asks for the Google / Meta keys and saves them to Netlify.
//   node scripts/set-keys.mjs
// Leave an answer empty to skip that key. Secrets are hidden while you type.
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const KEYS = [
  { key: "AUTH_GOOGLE_SECRET", label: "Google Client secret (يبدأ بـ GOCSPX-)", secret: true, check: /^GOCSPX-[\w-]{10,}$/ },
  { key: "META_APP_ID", label: "Meta App ID (أرقام فقط)", secret: false, check: /^\d{6,20}$/ },
  { key: "META_APP_SECRET", label: "Meta App secret", secret: true, check: /^[a-f0-9]{32}$/i },
  { key: "META_CONFIG_ID", label: "Meta Configuration ID (اختياري)", secret: false, check: /^\d{6,20}$/ },
];

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        // Mask everything typed or pasted, even when readline redraws the prompt + line together.
        const i = s.indexOf(question);
        if (i !== -1) rl.output.write(s.slice(0, i + question.length) + "*".repeat(Math.max(0, s.length - i - question.length)));
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
        else rl.output.write("*".repeat(s.length));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function setNetlify(key, value, secret) {
  const args = ["netlify", "env:set", key, value];
  if (secret) args.push("--secret", "--context", "production", "deploy-preview", "branch-deploy");
  const res = spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  if (res.status !== 0) {
    console.log(`✖ ما قدرت أحفظ ${key}:\n${res.stderr?.toString() ?? ""}`);
    return false;
  }
  return true;
}

console.log("اكتب كل قيمة واضغط Enter. لو ما عندك وحدة، اتركها فاضية واضغط Enter.\n");
let saved = 0;
for (const { key, label, secret, check } of KEYS) {
  for (;;) {
    const value = await ask(`${label}: `, secret);
    if (!value) break;
    if (!check.test(value)) {
      const hint =
        key === "AUTH_GOOGLE_SECRET" && !value.startsWith("GOCSPX-")
          ? value.includes(".apps.googleusercontent.com")
            ? "اللي لصقته هو Client ID، مو السر. انسخ الكود اللي يبدأ بـ GOCSPX-."
            : "اللي لصقته ما يبدأ بـ GOCSPX-. انسخ السر من Google مرة ثانية."
          : `اللي لصقته طوله ${value.length} حرف وشكله مو صحيح. تأكد إنك نسخت القيمة كاملة.`;
      console.log(`✖ ${hint}`);
      continue;
    }
    if (setNetlify(key, value, secret)) {
      console.log(`✔ ${key} انحفظ`);
      saved++;
    }
    break;
  }
}
console.log(saved ? `\n✔ انحفظ ${saved}. قول لـ Claude "خلصت" عشان يعيد نشر الموقع.` : "\nما انحفظ شي.");
