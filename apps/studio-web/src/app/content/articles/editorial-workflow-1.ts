// Part 1 of the "Editorial workflow" guide (sections 1–8). English edition of flujo-de-trabajo-editorial.
export const PART_1 = `
<p>Every newsroom has an editorial workflow, even if nobody has ever written it down. It lives in how topics get chosen, in who reads a piece before it goes out, in the moment someone remembers to check the headline for search, and in whether a story ends up on social media or not. The difference between a publisher that ships calmly and one that is always firefighting rarely comes down to the talent of its journalists. It comes down to whether that workflow is explicit, shared and measurable, or whether it depends on the memory of three people.</p>
<p>This guide explains how to design the editorial workflow of a digital publisher from start to finish. It is written for heads of content, section editors, SEO leads and product teams who want to bring order to the way they work without turning the newsroom into a paperwork office. It covers the stages, the roles, where SEO and artificial intelligence fit, the quality checks before publishing, distribution across several sites and channels, the metrics that really matter and a plan to roll it out in thirty days.</p>
<p>You do not need to apply all of it at once. What helps is understanding the whole logic and then deciding which parts your team needs today and which can wait.</p>

<h2 id="what-is">What an editorial workflow is (and what it is not)</h2>
<p>An editorial workflow is the agreed sequence of steps, owners and criteria that a piece goes through, from the moment someone pitches the topic until it is published, distributed and, over time, updated or retired. It has three inseparable parts:</p>
<ul>
<li><strong>Stages:</strong> the states a piece moves through, for example pitched, assigned, in writing, in editing, ready for review, approved, scheduled, published and being updated.</li>
<li><strong>Owners:</strong> who moves the piece from one stage to the next and who has the final word at each step.</li>
<li><strong>Exit criteria:</strong> what has to be true before the piece moves on. A story does not become "approved" because someone glanced at it, but because it meets a concrete list of conditions.</li>
</ul>
<p>It helps to separate it from the things it is often confused with:</p>
<ul>
<li><strong>It is not the CMS.</strong> The content management system is where the piece is stored and published. The editorial workflow is the process that gets it there. Many CMSs have states such as "draft" or "pending review", but they only cover part of the journey and rarely the planning or the distribution.</li>
<li><strong>It is not the editorial calendar.</strong> The calendar says what gets published and when. The workflow says how it gets produced. A calendar without a workflow is a wish list; a workflow without a calendar works, but has no rhythm.</li>
<li><strong>It is not a style guide.</strong> The style guide defines how you write. The workflow defines who checks that it was written that way, and when.</li>
<li><strong>It is not bureaucracy.</strong> A good workflow removes steps rather than adding them. If, after defining it, the team takes longer to publish an urgent story, the design is wrong.</li>
</ul>
<p>A practical way to find out whether your workflow really exists is to ask five different people in the newsroom three questions: who approves a piece before it is published, what is checked before approving it, and what happens if publishing fails on one of the sites. If the answers do not match, the workflow lives in each person's head and not in a shared system.</p>

<h2 id="why">Why a digital publisher needs a defined editorial workflow</h2>
<p>In a small newsroom with a single site and five people sitting together, the workflow can stay informal for quite a while. The problems start when any of these grows: the number of people, the number of sites or channels, the volume of pieces or the pressure for search traffic.</p>
<h3>The cost of invisible coordination</h3>
<p>When the process is not written down, every piece needs manual coordination: messages asking whether a story is ready, reminders for someone to add the image, last-minute fixes because nobody checked the headline for search. That time never shows up in a report, but it eats a large part of every editor's day. An explicit workflow turns that coordination into visible information: anyone can see what state a piece is in and what it is missing.</p>
<h3>Errors that reach the reader</h3>
<p>The most common errors on digital publishers are not journalistic, they are process errors: a story published without an image, or with an image that has no alt text; a title that gets truncated in search results; a broken link; a wrong date in the structured data; a piece published on one site but not on the other; a correction applied on the website but not in the newsletter. Almost all of them are prevented by a check that someone owns.</p>
<h3>SEO arrives too late</h3>
<p>At many publishers SEO works as an after-the-fact check: the story is written, published, and then someone from the audience team suggests changing the title or adding links. By then the piece has already had its moment of peak visibility. Building SEO into the workflow, from choosing the topic to the final review, changes the outcome without adding work, because decisions are made once and at the right time.</p>
<h3>Several sites, several versions of the truth</h3>
<p>Groups running several titles or topic sites usually end up with a different process for each. That multiplies training effort, makes results impossible to compare and means the same information gets published with different figures depending on the site. A shared workflow with rules per destination lets each site keep its personality without reinventing the process.</p>
<h3>AI needs a lane</h3>
<p>The arrival of generative AI tools in newsrooms has made a defined workflow more urgent. Without one, AI gets used unevenly: some journalists use it for everything, others for nothing, and nobody knows which texts went through a tool or who verified them. With a clear workflow, AI has a specific place, a list of permitted tasks and a mandatory human review before publishing.</p>

<h2 id="stages">The stages of a modern editorial workflow</h2>
<p>There is no correct number of stages. A workflow that is too short does not show you where the bottleneck is; one that is too long forces people to move pieces between states that add nothing. For most digital publishers, a ten-step scheme grouped into four blocks works well.</p>
<h3>Block 1: plan</h3>
<ol>
<li><strong>Pitch.</strong> Someone suggests a topic: a reporter, the audience team, a breaking news alert or a search demand analysis. The pitch includes, at least, the topic, the angle and why it is worth doing now.</li>
<li><strong>Assignment.</strong> The section editor accepts the pitch and turns it into an assignment with an owner, a deadline, a format, a target query and publishing destinations. From this point on the piece officially exists.</li>
</ol>
<h3>Block 2: produce</h3>
<ol start="3">
<li><strong>Writing.</strong> The reporter researches and writes. Sources, data and candidate images are attached to the piece, not to a separate email.</li>
<li><strong>Editing.</strong> An editor reviews structure, clarity, style and facts. They can send the piece back to writing with specific comments.</li>
<li><strong>Publishing preparation.</strong> SEO title, meta description, lead image with alt text, internal links, tags and versions for each channel are completed.</li>
</ol>
<h3>Block 3: approve</h3>
<ol start="6">
<li><strong>Pre-publication checks.</strong> The checklist runs: title length, meta description, valid structured data, images, linked sources, spelling. Whatever can be automated is automated.</li>
<li><strong>Approval.</strong> A person with editorial authority approves the piece. The approval is recorded with a name and a time.</li>
</ol>
<h3>Block 4: publish and maintain</h3>
<ol start="8">
<li><strong>Publishing and distribution.</strong> The piece goes out to each site and channel in its own format and at its own time. If a destination fails, it is retried and someone is alerted.</li>
<li><strong>Measurement.</strong> Results are collected: traffic, search position, engaged reading time, interactions and subscriptions where relevant.</li>
<li><strong>Update or retirement.</strong> Pieces that are still useful are updated periodically; those that no longer make sense are merged, redirected or retired.</li>
</ol>
<p>Urgent pieces should not skip stages; they should move through them faster. A breaking story can go from pitch to publication in ten minutes if the workflow lets the same person assign, edit and approve, and if the checklist shrinks to what is essential for that format. What should never happen is a piece reaching the reader without anyone approving it.</p>
<aside class="callout"><p><strong>Tip:</strong> name stages with verbs or states everyone understands without explanation. "Ready for review" beats "Stage 4". If a new hire does not know what a state means, that state is either unnecessary or badly named.</p></aside>

<h2 id="roles">Roles and responsibilities in the newsroom</h2>
<p>Stages only work if each one has an owner. Most digital publishers involve the following roles, even if one person covers several of them:</p>
<table>
<thead><tr><th>Role</th><th>What they do in the workflow</th><th>Decides on</th></tr></thead>
<tbody>
<tr><td>Editor-in-chief or head of content</td><td>Sets priorities, quality standards and publishing rules.</td><td>What gets covered and to what standard.</td></tr>
<tr><td>Section editor</td><td>Accepts pitches, assigns pieces, sets owners and deadlines.</td><td>The assignment and its priority.</td></tr>
<tr><td>Reporter or writer</td><td>Researches, writes and attaches sources, data and images.</td><td>The content of their draft.</td></tr>
<tr><td>Editor</td><td>Reviews structure, style and facts; returns the piece or signs off the edit.</td><td>Whether the text is ready to prepare.</td></tr>
<tr><td>SEO or audience lead</td><td>Brings search demand, reviews titles, internal linking and structured data.</td><td>Search optimisation.</td></tr>
<tr><td>Photo or design</td><td>Selects or produces images, charts and social cards.</td><td>Visual assets.</td></tr>
<tr><td>Social and distribution</td><td>Adapts the piece to each channel and schedules it.</td><td>Format and timing per channel.</td></tr>
<tr><td>Approver</td><td>Gives the final sign-off before publishing.</td><td>Whether the piece gets published.</td></tr>
</tbody>
</table>
<h3>Use a simple RACI matrix</h3>
<p>To avoid ambiguity, assign to each stage who is <em>responsible</em> for doing it, who <em>approves</em> it, who must be <em>consulted</em> and who just needs to be <em>informed</em>. You do not need a long document: a ten-row table is enough. What matters is that each stage has a single approver. When two people can approve, in practice neither feels responsible.</p>
<h3>Approval is always human</h3>
<p>Even when part of the work is automated or AI-assisted, the decision to publish must be made by an identifiable person. It is a matter of editorial accountability and also of trust: readers and search engines increasingly value knowing who stands behind what is published. Recording who approved each piece is not about distrusting the team; it protects everyone when something goes wrong.</p>
<h3>Roles in small teams</h3>
<p>A three-person newsroom does not have eight roles, but it does have eight responsibilities. Typically the writer prepares the piece for publishing, someone else edits and approves it, and distribution is scheduled on approval. The minimum rule worth keeping even in very small teams is that whoever writes a piece is not the one who approves it, except in specific emergencies that get logged.</p>

<h2 id="planning">Planning from search demand</h2>
<p>Deciding what to cover is the most important editorial decision and often the least structured one. News judgement remains essential, but today it can be complemented with data that used to be unavailable: what people search for, which topics your publication already covers and which ones your competitors cover.</p>
<h3>Three signals to prioritise topics</h3>
<ul>
<li><strong>Demand:</strong> how many people search for information on the topic and whether that demand is growing. Search trends, the queries already bringing traffic to your site and the related questions search engines display are good sources.</li>
<li><strong>Coverage gap:</strong> whether your publication already has a piece that answers that query, whether it is out of date, or whether it does not exist. Often the best new piece is an update of an old one.</li>
<li><strong>Timeliness:</strong> whether there is a reason to publish now, such as an announcement, an event, a deadline or a regulatory change.</li>
</ul>
<p>Combining the three signals into a simple score helps structure the planning meeting. The point is not to let a number decide for the newsroom, but to arrive at the meeting with a ranked list and discuss the exceptions rather than the whole list.</p>
<h3>From topic to search intent</h3>
<p>The same topic can serve very different intents. "Budget 2027" can mean what changes for households, when it is voted on, which items go up or how it affects the self-employed. Each intent calls for a different format: an explainer, a breaking piece, a chart or an FAQ. Part of planning is deciding which intent you will serve and in which format, and writing it into the assignment.</p>
<h3>Topic clusters instead of isolated pieces</h3>
<p>The publishers that perform best in search usually organise coverage into groups of related pieces: a pillar piece that explains the topic in depth and several supporting pieces that answer specific questions, all linked together. Planning in clusters has editorial advantages beyond SEO: it avoids repeating information in every piece, makes coverage easier to update and gives readers a clear path to go deeper.</p>
<h3>Planning rhythms</h3>
<p>Most newsrooms combine three horizons: daily planning for the news cycle, weekly planning for original pieces and explainers, and quarterly planning for big coverage, specials and evergreen updates. The editorial workflow should cover all three, so that a piece planned weeks ago and today's breaking story share the same stages and checks.</p>

<h2 id="assignment">The editorial assignment: what it should include</h2>
<p>The assignment, or brief, is the contract between the person who requests a piece and the person who writes it. A good brief saves more time than any tool, because it prevents rewrites caused by misunderstandings. A bad brief, or no brief at all, is the most frequent reason pieces reach editing with the wrong angle.</p>
<h3>Minimum brief template</h3>
<table>
<thead><tr><th>Field</th><th>What it is for</th><th>Example</th></tr></thead>
<tbody>
<tr><td>Topic and angle</td><td>What is told and from which perspective.</td><td>What the 2027 budget changes for households.</td></tr>
<tr><td>Target query</td><td>The main search the piece must answer.</td><td>budget 2027 households</td></tr>
<tr><td>Intent</td><td>What the reader needs.</td><td>Understand how it affects their finances.</td></tr>
<tr><td>Format</td><td>Type of piece and approximate length.</td><td>Explainer of 900 to 1,200 words with a table.</td></tr>
<tr><td>Sources</td><td>Essential documents and people.</td><td>The bill, the ministry, two experts.</td></tr>
<tr><td>Related pieces</td><td>Own content to link to.</td><td>Tax return guide, piece on the energy rebate.</td></tr>
<tr><td>Destinations</td><td>Where and how it is published.</td><td>Main site in full, sister site summarised, thread on X.</td></tr>
<tr><td>Deadline and priority</td><td>When it must be ready.</td><td>Thursday 9:00, high priority.</td></tr>
<tr><td>Owners</td><td>Who writes, edits and approves.</td><td>Laura writes, Omar edits, the business editor approves.</td></tr>
</tbody>
</table>
<h3>Reusable briefs</h3>
<p>Many pieces follow recurring patterns: match reports, election results, weather forecasts, service guides, reviews. For those formats it pays to have brief templates with part of the fields already filled in, so the section editor only completes what changes. It also makes it easy for AI to propose a first draft of the brief from the pitch, which a person then reviews and adjusts.</p>
<h3>The brief lives with the piece</h3>
<p>The brief should not stay in an email or a separate document. If it lives in the same record as the draft, the editor can check whether the text delivers what was asked, the SEO lead sees the target query without asking, and months later whoever updates the piece understands why it was written that way.</p>

<h2 id="ai">Writing with AI: where it helps and where it does not</h2>
<p>Generative AI can save a newsroom a lot of time, but it can also introduce errors that are hard to spot if it is used without a framework. The useful question is not whether to use AI, but for which tasks, with which checks and who answers for the result.</p>
<h3>Tasks where AI usually adds value</h3>
<ul>
<li><strong>Initial research:</strong> summarising long documents, such as a bill or a report, so the reporter knows where to look. The reporter still reads the original source for everything they quote.</li>
<li><strong>Structure proposals:</strong> suggesting an outline for an explainer based on the brief.</li>
<li><strong>Headlines and meta descriptions:</strong> proposing several options within length limits for the editor to choose from and adjust.</li>
<li><strong>Channel adaptation:</strong> turning an approved piece into a thread, a carousel or newsletter copy while respecting the verified content.</li>
<li><strong>Image alt text:</strong> describing an image so a person can review and correct the description.</li>
<li><strong>Style review:</strong> spotting overly long sentences, repetition, excessive passive voice or breaches of the style guide.</li>
<li><strong>Working translations:</strong> producing a first version in another language for a native editor to review.</li>
</ul>
<h3>Tasks you should not delegate</h3>
<ul>
<li><strong>Facts and quotes:</strong> every figure, date, name or statement must be checked against the original source. Generative models can produce plausible but false data.</li>
<li><strong>Editorial judgement:</strong> deciding what is news, which angle is fair or what is left out out of respect for victims are decisions people must make.</li>
<li><strong>Sensitive topics:</strong> health, justice, minors, tragedies and elections require a level of care that cannot be automated.</li>
<li><strong>Unpublished information:</strong> confidential documents, personal data about sources or exclusives should not be fed into external tools without clear guarantees about how they are handled.</li>
</ul>
<h3>Rules for responsible use</h3>
<ol>
<li>Write down which tasks are allowed and which are not.</li>
<li>Every AI-assisted piece goes through the same editing and approval stages as any other.</li>
<li>The editor knows which parts were generated or transformed with AI, even if the reader does not need to know in every case.</li>
<li>Figures and quotes are always verified against the original source, and the source is linked or cited.</li>
<li>If your publication tells readers about its use of AI, the policy is public, specific and followed.</li>
</ol>
<p>Search engines have made it clear that what they value is the usefulness and reliability of content, not the tool used to produce it. Mass-generated text with no review that adds nothing new has little chance of performing; useful, verified text signed by a team that stands behind it does. The editorial workflow is what makes sure AI serves the second outcome.</p>

<h2 id="editing">Editing, fact-checking and style</h2>
<p>Editing is the stage where a draft becomes a publishable piece. At many digital publishers it has been squeezed by volume pressure, and that is precisely where most credibility-damaging errors slip through.</p>
<h3>What an editor checks</h3>
<ul>
<li><strong>Angle:</strong> whether the piece delivers the brief and the reader's intent, and whether the first paragraph says the most important thing.</li>
<li><strong>Structure:</strong> whether sections follow a logical order, whether subheadings describe their content and whether the piece can be skimmed.</li>
<li><strong>Facts:</strong> whether figures, dates and names are correct and attributed.</li>
<li><strong>Sources:</strong> whether every relevant claim has an identifiable source and, where possible, a link.</li>
<li><strong>Style:</strong> whether it follows the house style guide, whether the tone is right and whether it reads clearly the first time.</li>
<li><strong>Risks:</strong> whether there are potentially defamatory claims, unnecessary personal data or images with doubtful rights.</li>
</ul>
<h3>Actionable comments</h3>
<p>When an editor returns a piece, comments should be specific and anchored to the text: "this figure needs a source", "the second section repeats the first", "explain what this acronym means". General comments such as "give it another go" cause unnecessary iterations. If comments live in the piece itself, the writer resolves them one by one and the editor sees what changed without rereading everything.</p>
<h3>Versions and traceability</h3>
<p>Keeping the versions of a piece shows what changed between the draft and the published version, who changed it and why. It is useful for training, for settling disagreements and, above all, when something needs correcting after publication. Significant corrections should be flagged on the piece itself for readers, with the date and the reason.</p>
<h3>Fact-checking proportional to risk</h3>
<p>Not every piece needs the same level of verification. A match report with the final score needs fewer checks than an investigation into public contracts. Defining verification levels by type of piece, and recording the level in the brief, helps spend time where it matters most without blocking daily output.</p>
`;
