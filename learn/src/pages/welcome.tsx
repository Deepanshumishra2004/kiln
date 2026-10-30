import { Link } from "react-router-dom";
import { Callout, Code, PageHeader, Recap, Section } from "../components/ui";

export default function Page() {
  return (
    <>
      <PageHeader
        kicker="Start here"
        title="Welcome to Kiln"
        subtitle="We are building our own small version of OpenAI / Anthropic, in Rust, mostly from scratch. This site teaches everything you need to understand it."
        learn={[
          "What Kiln is, in one picture",
          "Why we build so much ourselves",
          "Which lessons to read first, depending on your role",
          "How each lesson page works",
        ]}
      />

      <Section title="What is Kiln?">
        <p>
          When you call ChatGPT or Claude from code, you send text to an <b>API</b> with a secret <b>API key</b>. A
          big machine somewhere checks your key, checks that you have not used too much, runs a <b>language model</b> on
          a <b>GPU</b>, sends the answer back word by word, and writes down how much it cost you.
        </p>
        <p>
          <b>Kiln does the same thing, on one laptop.</b> It has an API that the normal OpenAI SDK can call. It gives
          API keys to other people. It limits them, bills them, and shows everything in a dashboard. And it runs the
          model with an <b>inference engine that we write ourselves</b>.
        </p>
        <div className="grid3">
          <div className="card"><h4>🧠 The engine</h4><span className="small muted">Our own code that loads a model file and runs the math on the GPU to produce tokens. The hardest part.</span></div>
          <div className="card"><h4>🚪 The platform</h4><span className="small muted">Everything around the model: API, keys, rate limits, queues, billing, logs. Most of a real provider's code.</span></div>
          <div className="card"><h4>📊 The console</h4><span className="small muted">A web dashboard where we create keys, watch requests live and change limits.</span></div>
        </div>
        <Callout kind="idea">
          <p>
            The model is only <b>one box</b> in a big system. Most of the engineering of an AI company is around the
            model: identity, limits, money, fairness, speed and visibility. Kiln teaches both: the box, and everything
            around it.
          </p>
        </Callout>
      </Section>

      <Section title="Why build things from scratch?">
        <p>
          We could download a ready inference server and a ready API gateway, and have a working product in a week.
          But then we would not know <i>why</i> it works, <i>why</i> it is slow, or <i>how</i> to make it better.
        </p>
        <p>
          Rust is a low-level language. It lets us control every byte of memory, talk directly to the GPU, and still
          be safe. So we use it to build each layer ourselves: the tensor math, the GPU kernels, the tokenizer, the
          network protocol, the event log. We only <b>use</b> ready-made software where writing it ourselves would be
          dangerous (cryptography) or a whole separate career (a database, an operating system, a GPU driver).
        </p>
        <Callout kind="analogy">
          <p>
            Building a car from a kit teaches you to drive. Building the engine teaches you <i>why</i> the car drives.
            When something breaks or is slow, the person who built the engine knows where to look.
          </p>
        </Callout>
        <p>
          The full list is on the page <Link to="/build-vs-buy">What we build vs use</Link>.
        </p>
      </Section>

      <Section title="Which lessons should I read?">
        <p>Everyone should read the three <b>Start here</b> lessons and the Rust track. After that, it depends on your role:</p>
        <table>
          <thead><tr><th>You will work on…</th><th>Read in this order</th></tr></thead>
          <tbody>
            <tr>
              <td><b>The engine</b> (model math, GPU)</td>
              <td>Rust track → Bits & bytes → Memory & SIMD → GPUs & CUDA → all of “How LLMs work”</td>
            </tr>
            <tr>
              <td><b>The platform</b> (API, limits, billing)</td>
              <td>Rust track (especially async) → Tokenization → Sampling → Batching → all of “The platform”</td>
            </tr>
            <tr>
              <td><b>Everything / tech lead</b></td>
              <td>Top to bottom, in sidebar order</td>
            </tr>
          </tbody>
        </table>
        <Callout kind="warn">
          <p>
            Do not try to remember everything in one reading. Read a lesson, play with its visuals, answer the quiz,
            then come back to it when you start building that part. Understanding grows in layers.
          </p>
        </Callout>
      </Section>

      <Section title="How a lesson page works">
        <p>Every lesson follows the same shape, so you always know where you are:</p>
        <ol>
          <li><b>Why</b>: the problem this thing solves.</li>
          <li><b>Intuition</b>: an everyday analogy.</li>
          <li><b>Picture</b>: an interactive visual. Move the sliders, press the buttons. Break it.</li>
          <li><b>Code</b>: real Rust (or CUDA) as we will write it in Kiln.</li>
          <li><b>In Kiln</b>: where exactly this lives in our system.</li>
          <li><b>Check yourself</b>: short quizzes, then a recap.</li>
        </ol>
        <p>Coloured boxes mean:</p>
        <Callout kind="idea"><p>The one thing to remember from a section.</p></Callout>
        <Callout kind="analogy"><p>A comparison with everyday life.</p></Callout>
        <Callout kind="rust"><p>A Rust language detail.</p></Callout>
        <Callout kind="deep"><p>What really happens inside the machine. Optional on first reading.</p></Callout>
        <Callout kind="kiln"><p>How this maps to our code and our design.</p></Callout>
        <Callout kind="warn"><p>A common mistake or a security risk.</p></Callout>
      </Section>

      <Section title="Running this site">
        <p>The site lives in the <code>learn/</code> folder of the repository. It is a small React app.</p>
        <Code lang="text" title="terminal">{`
cd learn
npm install      # first time only
npm run dev      # open the URL it prints (usually http://localhost:5173)
`}</Code>
        <p>
          To add or change a lesson, edit a file in <code>learn/src/pages/</code>. The order of the sidebar is in{" "}
          <code>learn/src/pages.ts</code>. The longer written design documents are in <code>docs/</code>.
        </p>
      </Section>

      <Recap items={[
        "Kiln = our own mini LLM API provider: engine + platform + console, on one laptop.",
        "We build almost every layer ourselves to understand it deeply; we only use what is dangerous or huge to build.",
        "Start with the Big picture and Life of one request, then the Rust track.",
      ]} />
    </>
  );
}
