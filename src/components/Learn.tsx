import { useEffect, useRef, useState } from "react";
import { LESSONS, youtubeId, youtubeSearchUrl, type Lesson } from "../lib/lessons";
import { STATIC, type AppData } from "../useAppData";

export function Learn({ data, focus }: { data: AppData; focus?: string }) {
  const done = new Set(data.lessonsDone);
  return (
    <div className="stack">
      <section className="card">
        <h2>Learn to save 🎓</h2>
        <p className="muted">
          {done.size}/{LESSONS.length} lessons complete. Each lesson you pass adds +2 to your Money Score (up to +10). Watch the videos, then answer
          the quick check to complete it.
        </p>
        <div className="progress"><div style={{ width: `${(done.size / LESSONS.length) * 100}%` }} /></div>
      </section>
      <div className="lessons">
        {LESSONS.map((l) => (
          <LessonCard key={l.id} lesson={l} done={done.has(l.id)} focus={focus === l.id}
            onDone={() => data.setLessonsDone((d) => (d.includes(l.id) ? d : [...d, l.id]))} />
        ))}
      </div>
      <MyVideos data={data} />
    </div>
  );
}

function LessonCard({ lesson: l, done, focus, onDone }: { lesson: Lesson; done: boolean; focus: boolean; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);
  const correct = picked === l.quiz.answer;
  return (
    <article ref={ref} className={`card lesson ${done ? "done" : ""} ${focus ? "focus" : ""}`}>
      <div className="card-head">
        <h3>{done ? "✅ " : ""}{l.title}</h3>
        <span className="muted small">{l.minutes} min</span>
      </div>
      <p>{l.summary}</p>
      <ul className="points">{l.points.map((p) => <li key={p}>{p}</li>)}</ul>
      <a className="btn secondary" href={youtubeSearchUrl(l.videoQuery)} target="_blank" rel="noreferrer">▶ Watch videos on this</a>
      <div className="quiz">
        <strong>Quick check: {l.quiz.q}</strong>
        <div className="quiz-options">
          {l.quiz.options.map((o, i) => (
            <button
              key={o}
              className={`opt ${picked === i ? (i === l.quiz.answer ? "right" : "wrong") : ""}`}
              onClick={() => {
                setPicked(i);
                if (i === l.quiz.answer) onDone();
              }}
            >
              {o}
            </button>
          ))}
        </div>
        {picked != null && <p className={`small ${correct ? "good" : "bad"}`}>{correct ? "Correct! " : "Not quite. "}{l.quiz.why}</p>}
      </div>
    </article>
  );
}

function MyVideos({ data }: { data: AppData }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <section className="card">
      <h2>Your saved videos</h2>
      <p className="muted small">Found a video that helped? Paste the YouTube link to keep it here.</p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (!youtubeId(url)) return;
          data.setVideos((v) => [...v, { url, title: title || "Saved video" }]);
          setUrl("");
          setTitle("");
        }}
      >
        <input placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="YouTube link" />
        <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        <button className="btn" disabled={!youtubeId(url)}>Save</button>
      </form>
      <div className="videos">
        {data.videos.map((v, i) => (
          <figure key={v.url + i}>
            {STATIC ? (
              <a className="btn secondary" href={v.url} target="_blank" rel="noreferrer">▶ Watch on YouTube</a>
            ) : (
            <div className="video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(v.url)}`}
                title={v.title}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            )}
            <figcaption>
              {v.title} <button className="link small" onClick={() => data.setVideos((vs) => vs.filter((_, j) => j !== i))}>Remove</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
