"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, GraduationCap, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tutorial } from "@/lib/tutorials";
import { saveQuiz } from "@/app/(app)/help/actions";

type Q = { options: string[]; answer: number };
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
const short = (s: string) => (s.length > 170 ? `${s.slice(0, 167)}…` : s);

/** 3 questions: "Which of these is part of this guide?" — one real step and two steps from other guides. */
function makeQuiz(t: Tutorial, all: Tutorial[]): Q[] {
  const others = shuffle(all.filter((x) => x.key !== t.key && x.group === t.group).flatMap((x) => x.steps));
  const pool = others.length >= 6 ? others : shuffle([...others, ...all.filter((x) => x.key !== t.key && x.group !== t.group).flatMap((x) => x.steps)]);
  return shuffle(t.steps).slice(0, 3).map((right, i) => {
    const options = shuffle([right, pool[i * 2] ?? "Ask IT to do it for you", pool[i * 2 + 1] ?? "Email the boss and wait for a reply"]);
    return { options, answer: options.indexOf(right) };
  });
}

export function TutorialQuiz({ tutorial, all, passed }: { tutorial: Tutorial; all: Tutorial[]; passed: boolean }) {
  const [quiz, setQuiz] = useState<Q[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [done, setDone] = useState(passed);
  const [pending, start] = useTransition();
  if (tutorial.steps.length < 2) return null;
  if (!quiz) return (
    <button type="button" onClick={() => { setQuiz(makeQuiz(tutorial, all)); setPicked({}); setResult(null); }} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm", done ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-line hover:bg-canvas")}>
      {done ? <CheckCircle2 className="size-4" /> : <GraduationCap className="size-4 text-gold-600" />} {done ? "Quiz passed · try again" : "Take the quiz (3 questions)"}
    </button>
  );
  const check = () => {
    const score = quiz.reduce((s, q, i) => s + (picked[i] === q.answer ? 1 : 0), 0);
    start(async () => { const r = await saveQuiz(tutorial.key, score, quiz.length); const ok = "passed" in r && !!r.passed; setResult({ score, passed: ok }); if (ok) setDone(true); });
  };
  return (
    <div className="mt-4 w-full rounded-xl border border-line bg-canvas/50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><GraduationCap className="size-4 text-gold-600" /> Quiz: {tutorial.title}</p>
      <ol className="space-y-4">
        {quiz.map((q, i) => (
          <li key={i} className="text-sm">
            <p className="mb-1.5 font-medium">{i + 1}. Which of these is part of “{tutorial.title}”?</p>
            <div className="space-y-1.5">
              {q.options.map((o, j) => {
                const show = !!result, right = j === q.answer, mine = picked[i] === j;
                return (
                  <label key={j} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border bg-surface px-3 py-2", show && right && "border-emerald-400 bg-emerald-50", show && mine && !right && "border-red-300 bg-red-50", !show && mine && "border-navy-900", !show && !mine && "border-line")}>
                    <input type="radio" name={`q${tutorial.key}${i}`} checked={mine} disabled={show} onChange={() => setPicked({ ...picked, [i]: j })} className="mt-1" />
                    <span className="flex-1">{short(o)}</span>
                    {show && right && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                    {show && mine && !right && <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!result ? <button type="button" disabled={pending || Object.keys(picked).length < quiz.length} onClick={check} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Checking…" : "Check answers"}</button>
          : <p className={cn("text-sm font-medium", result.passed ? "text-emerald-700" : "text-amber-700")}>{result.score} of {quiz.length} right · {result.passed ? "Passed 🎉" : "Read the steps again and retry"}</p>}
        {result && <button type="button" onClick={() => { setQuiz(makeQuiz(tutorial, all)); setPicked({}); setResult(null); }} className="text-sm text-navy-900 hover:underline">New questions</button>}
        <button type="button" onClick={() => setQuiz(null)} className="text-sm text-muted hover:text-ink">Close</button>
      </div>
    </div>
  );
}
