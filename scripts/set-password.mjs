// Sets the login email + password for the site.
//   npm run set-password            -> saves to Netlify (needs `netlify link`)
//   npm run set-password -- --local -> saves to the local .env file
// The password itself is never stored: only an scrypt hash (ADMIN_PASSWORD_HASH).
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const local = process.argv.includes("--local");

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
        else rl.output.write("*".repeat(s.length));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(".");
}

function setNetlify(key, value, secret) {
  const args = ["netlify", "env:set", key, value];
  if (secret) args.push("--secret");
  const res = spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  if (res.status !== 0) {
    console.error(`\n✖ ما قدرت أحفظ ${key} في Netlify:\n${res.stderr?.toString() ?? ""}`);
    process.exit(1);
  }
}

function setLocal(values) {
  let env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
  }
  writeFileSync(".env", env.startsWith("\n") ? env.slice(1) : env);
}

const email = (await ask("الإيميل اللي بتسجل فيه: ")).trim().toLowerCase();
if (!/^[^\s@"'`$&|;<>()\\]+@[^\s@"'`$&|;<>()\\]+\.[a-z]{2,}$/i.test(email)) {
  console.error("✖ الإيميل غير صحيح.");
  process.exit(1);
}
const password = await ask("كلمة المرور (10 أحرف أو أكثر): ", { hidden: true });
if (password.length < 10) {
  console.error("✖ كلمة المرور لازم تكون 10 أحرف أو أكثر.");
  process.exit(1);
}
const confirm = await ask("أعد كتابة كلمة المرور: ", { hidden: true });
if (confirm !== password) {
  console.error("✖ كلمتين المرور مو متطابقة.");
  process.exit(1);
}

const hash = hashPassword(password);
if (local) {
  setLocal({ ALLOWED_EMAIL: email, ADMIN_PASSWORD_HASH: hash });
  console.log("✔ انحفظت في ملف .env");
} else {
  console.log("جاري الحفظ في Netlify…");
  setNetlify("ALLOWED_EMAIL", email, false);
  setNetlify("ADMIN_PASSWORD_HASH", hash, true);
  console.log("✔ انحفظت في Netlify. أعد نشر الموقع عشان تشتغل.");
}
