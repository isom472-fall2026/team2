const educationSteps = [
  {
    number: '01',
    title: 'Prepare your KU evidence',
    body: 'Use your active Kuwait University educational email address and download your course schedule for the current semester. The schedule helps verify that you are an enrolled student.',
  },
  {
    number: '02',
    title: 'Secure your GitHub account',
    body: 'Enable two-factor authentication before applying. Keep your recovery codes in a secure place so you do not lose access to your account.',
  },
  {
    number: '03',
    title: 'Complete your billing profile',
    body: 'Enter your billing name and address in GitHub. You do not need to add a payment method for the GitHub Education Pack application.',
  },
  {
    number: '04',
    title: 'Apply through GitHub Education',
    body: 'Open the GitHub Education application, select the student offer, sign in, and submit your KU email and course schedule when asked. Check your email for follow-up requests from GitHub.',
  },
]

const workflowSteps = [
  {
    number: '01',
    title: 'Sign in to GitHub in VS Code',
    body: 'Install VS Code, open the Accounts menu in the Activity Bar, choose Sign in to sync settings, and finish the browser authorization with the GitHub account that owns your Education benefits.',
  },
  {
    number: '02',
    title: 'Open one Copilot session per story',
    body: 'Keep each issue or user story in its own VS Code agent session. Start with the acceptance criteria, ask the agent to inspect the relevant code, and keep the implementation and verification for that story together.',
  },
  {
    number: '03',
    title: 'Give the agent useful context',
    body: 'Include the issue number, constraints, files involved, and the check you expect to pass. Let the agent inspect the repository before asking for a broad change.',
  },
  {
    number: '04',
    title: 'Check the session token count',
    body: 'In the VS Code Chat view, open the current agent session details or usage indicator. Record the displayed token usage before closing the session so the work can be reported for its issue.',
  },
]

function GuideSection({ eyebrow, title, intro, steps }) {
  return (
    <section className="blog-guide" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-heading`}>
      <div className="blog-guide__header">
        <span className="auth-card__eyebrow">{eyebrow}</span>
        <h2 id={`${title.toLowerCase().replaceAll(' ', '-')}-heading`}>{title}</h2>
        <p>{intro}</p>
      </div>
      <ol className="blog-steps">
        {steps.map(({ number, title: stepTitle, body }) => (
          <li key={number} className="blog-step">
            <span className="blog-step__number" aria-hidden="true">{number}</span>
            <div>
              <h3>{stepTitle}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function Blog() {
  return (
    <article className="blog-page">
      <header className="blog-page__header">
        <span className="auth-card__eyebrow">Student resources</span>
        <h1>Blog</h1>
        <p>Guides and practical notes for students using the KU Exchange platform.</p>
      </header>

      <div className="blog-index">
        <details className="blog-entry" open>
          <summary>Record exact token usage</summary>
          <div className="blog-entry__content">
            <p className="blog-entry__description">
              A practical guide to claiming GitHub Education benefits and using GitHub with
              VS Code agents for focused, traceable project work.
            </p>
            <GuideSection
              eyebrow="Guide 01 / GitHub Education"
              title="Apply for the Education Pack"
              intro="Have these details ready before you begin. GitHub may ask for additional proof of current enrollment during its review."
              steps={educationSteps}
            />

            <div id="agent-workflow">
              <GuideSection
                eyebrow="Guide 02 / VS Code agents"
                title="Work on your project with focus"
                intro="A clean session history makes it easier to understand what changed, how much work it used, and which issue it belongs to."
                steps={workflowSteps}
              />
            </div>

            <aside className="blog-callout">
              <span className="blog-callout__mark" aria-hidden="true">i</span>
              <div>
                <h2>Keep a small record</h2>
                <p>
                  At the end of each session, note the issue number, files changed, validation
                  command, and token count. Review the diff before moving to the next story.
                </p>
              </div>
            </aside>

            <nav className="blog-resources" aria-label="Blog resources">
              <h2>Official resources</h2>
              <a href="https://education.github.com/pack" target="_blank" rel="noopener noreferrer">GitHub Student Developer Pack</a>
              <a href="https://docs.github.com/en/education" target="_blank" rel="noopener noreferrer">GitHub Education documentation</a>
              <a href="https://code.visualstudio.com/docs/editor/settings-sync" target="_blank" rel="noopener noreferrer">Sign in to VS Code</a>
            </nav>
          </div>
        </details>
      </div>
    </article>
  )
}