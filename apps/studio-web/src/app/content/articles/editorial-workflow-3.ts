// Part 3 of the "Editorial workflow" guide: formats, governance, accessibility, case study, glossary.
export const PART_3 = `
<h2 id="formats">One workflow, several formats</h2>
<p>A common mistake is designing the workflow around a single type of piece, usually the standard article, and discovering later that the rest do not fit. The answer is not a separate workflow per format, but keeping the same stages and adjusting the brief template, the checklist and the verification level for each format.</p>
<h3>Breaking news</h3>
<p>Breaking news needs speed without giving up accountability. The usual approach is a fast lane in which the section editor or duty editor can assign, edit and approve in a single step, with a checklist reduced to the essentials: a fact confirmed by at least one reliable source, a clear title, an image with rights or no image at all, and a flag saying the story will be expanded. From there, the piece enters the normal workflow for its expansion and final version, which does go through every check.</p>
<h3>Live blogs</h3>
<p>Live blogs are living pieces updated for hours. The workflow should let several people add entries, let an editor review each one before or right after it goes live depending on the risk, and keep the top summary current with the most important points. When the event ends, turn the live blog into a summary piece or link it from a stable piece, because live blogs tend to lose search value as soon as the event is over.</p>
<h3>Explainers and service guides</h3>
<p>These have the longest shelf life and benefit most from editorial SEO. They need a detailed brief with the target query and related questions, careful structural editing, correct structured data and a review date assigned from day one. In this format tables, lists and FAQ sections make particular sense when they answer real reader questions.</p>
<h3>Features and investigations</h3>
<p>Features have long cycles, more people involved and more legal risk. The workflow is the same, but with intermediate milestones inside the writing stage, legal review when needed and a higher verification level. Distribution planning starts before the text is finished: which derivative pieces will be published, on which channels and in what order.</p>
<h3>Newsletters</h3>
<p>A newsletter is both a publishing destination and a piece in its own right. Treated as a destination, approved pieces feed it with a summary and a link. If it carries original content, it needs its own brief, edit and approval. In both cases the publishing calendar should show newsletters next to every other output, so a piece is never promoted before it is live.</p>
<h3>Visual and data pieces</h3>
<p>Charts, maps and visualisations require the writing stage to include preparing and verifying the data, and the checklist to confirm that charts have a title, a source, units and a text description for people who cannot see them. Errors in this format are especially visible and widely shared, so it deserves a high verification level even when the piece is short.</p>
<table>
<thead><tr><th>Format</th><th>Verification</th><th>Checklist</th><th>Follow-up</th></tr></thead>
<tbody>
<tr><td>Breaking news</td><td>Minimum, confirmed</td><td>Reduced</td><td>Expansion within hours</td></tr>
<tr><td>Live blog</td><td>Per entry</td><td>Per entry and summary</td><td>Summary piece at close</td></tr>
<tr><td>Explainer or guide</td><td>High</td><td>Full, with SEO</td><td>Periodic review date</td></tr>
<tr><td>Feature</td><td>Very high and legal</td><td>Full</td><td>Track responses</td></tr>
<tr><td>Newsletter</td><td>That of its pieces</td><td>Links and timing</td><td>Open and click metrics</td></tr>
<tr><td>Data and charts</td><td>High on the data</td><td>Title, source, description</td><td>Data refresh</td></tr>
</tbody>
</table>

<h2 id="governance">Governance: style, corrections and AI policy</h2>
<p>An editorial workflow rests on three documents that should be written down, accessible and current. They do not need to be long; they need to be specific and known to the whole team.</p>
<h3>Style guide</h3>
<p>It defines how the publication writes: numbers, dates, proper names, acronyms, tone, loanwords, rules for headlines and subheadings. To make it useful inside the workflow, turn its most important rules into checks that can be automated or verified at a glance, and link it from every piece's record.</p>
<h3>Corrections policy</h3>
<p>It explains what happens when an error is found after publishing: who decides whether a correction is significant, how it is flagged to readers, whether a public corrections log is kept and how the correction propagates to the other destinations where the piece was published. Having this written down avoids improvising at the worst moment and shows readers that the publication stands behind what it publishes.</p>
<h3>AI use policy</h3>
<p>It should specify which tasks may be AI-assisted, which are excluded, which tools are approved, which data must never be entered into them, how output is verified and, if the publication chooses, how readers are informed. Review it every few months, because tools and practices change fast, and make sure the workflow enforces it rather than relying on goodwill alone.</p>
<h3>Who maintains the documents</h3>
<p>Each document needs an owner and a review date. A style guide nobody has updated in years, or an AI policy written before the team started using its current tools, creates more confusion than help.</p>

<h2 id="accessibility">Accessibility and legal obligations</h2>
<p>Accessibility and legal compliance are usually treated as technical or legal matters, but many of their requirements are met or missed inside the editorial workflow, piece by piece.</p>
<h3>Editorial accessibility</h3>
<ul>
<li><strong>Alt text</strong> that describes informative images, and empty alt text for decorative ones.</li>
<li><strong>Hierarchical subheadings</strong> that let screen-reader users navigate the piece.</li>
<li><strong>Descriptive links</strong> instead of "click here".</li>
<li><strong>Text descriptions of charts</strong> and tables with headers.</li>
<li><strong>Captions or transcripts</strong> for video and audio.</li>
<li><strong>Plain language</strong> and reasonable sentence length, which benefit every reader.</li>
</ul>
<p>Most of these items can be part of the pre-publication checklist, and several can be checked automatically.</p>
<h3>Image rights and third-party content</h3>
<p>Every image, video or chart should have its origin and usage rights recorded with the piece. This is especially important when the same asset is reused on several sites or on social media, because a licence may cover one use and not another.</p>
<h3>Personal data</h3>
<p>Pieces that include personal data about private individuals, minors or victims need a clear rule on what gets published and what does not. The workflow can flag these pieces for an extra review, and the AI policy should prevent that data from being entered into external tools without guarantees.</p>
<h3>Sponsored content</h3>
<p>When a piece is advertising or sponsored, it must be clearly labelled as such for readers and, in its links, with the right attributes for search engines. The workflow should have a specific piece type for this content, with its own approval and its own visible label.</p>

<h2 id="case-study">Case study: a day in a newsroom with a defined workflow</h2>
<p>To see how it all fits together, let us follow a fictional but realistic day at a regional publisher with three sites (the main title, a service site and a sports site) and a presence on two social networks.</p>
<h3>8:00, planning</h3>
<p>The business editor opens the editorial plan. The system has detected that searches about the regional budget have grown sharply since the previous afternoon, that the publication has no piece explaining how it affects households, and that the rental aid guide is fourteen months old. At the 8:15 meeting two pitches are accepted: a budget explainer and an update of the rental aid guide.</p>
<h3>8:30, assignment</h3>
<p>The explainer goes to Laura with the target query, three related questions worth answering, links to two of the publication's own pieces, destinations (full on the main site, short version on the service site, a thread on one social network) and approval by the section editor. The guide update goes to Ana with a list of the figures that need checking.</p>
<h3>9:00 to 11:00, writing</h3>
<p>Laura uses an AI-assisted summary of the budget bill to locate the relevant items and reads the original document for everything she quotes. She writes directly in the piece's record, where the brief already sits, and attaches the sources and an archive image with rights. She asks the system for three SEO title options and picks one, which she adjusts by hand.</p>
<h3>11:00, editing</h3>
<p>Omar edits the piece. He leaves two comments anchored to the text: a figure without a source and a section that repeats the previous one. Laura resolves them in fifteen minutes. Omar checks the structure, tightens the first paragraph and marks the piece ready for review.</p>
<h3>11:30, checks and approval</h3>
<p>The section editor opens the piece and sees the check results next to the text: a 54-character title, a correct meta description, valid structured data, an image with alt text and three linked sources. There is one warning: an internal link to last year's piece is missing. She adds it and approves. The approval is recorded with her name.</p>
<h3>12:00, publishing</h3>
<p>The piece goes out on the main site at 12:00, the short version on the service site at 12:10 and the thread at 12:30, the hour when that network has the biggest audience for the publication. Publishing to the service site fails because the application password has expired; the system retries, alerts the person responsible for the integration, who renews the credential, and the piece goes live at 12:25. The record shows at all times which destinations are live.</p>
<h3>17:00, breaking news</h3>
<p>An urgent story comes in about an accident on a motorway. The duty editor uses the fast lane: assigns, edits and approves a four-line piece with the fact confirmed by the official source, no image, flagged for expansion. An hour later, the expansion goes through the full workflow.</p>
<h3>The next day, measurement</h3>
<p>At the weekly review, the team sees that the explainer ranks near the top for its target query and for two of the related questions, that engaged reading time is high and that the thread drove traffic to the service site. They also see that the updated rental aid guide has recovered visibility. The guide's next review date is set for six months later.</p>
<p>None of these steps is extraordinary. What changes compared with a newsroom without a workflow is that nobody had to ask what state a piece was in, that errors were caught before publishing, that the publishing failure was fixed in minutes rather than days, and that the next day's decisions were based on data.</p>

<h2 id="glossary">Editorial workflow glossary</h2>
<dl>
<dt>Approval</dt><dd>A recorded decision by a person with editorial authority that allows a piece to be published. It includes who approved, when and which version.</dd>
<dt>Target query</dt><dd>The main search a piece aims to answer. It is decided at planning and written into the brief.</dd>
<dt>Cannibalisation</dt><dd>When several pieces from the same publisher compete for the same query, splitting visibility between them. It is fixed by merging or differentiating the pieces.</dd>
<dt>Topic cluster</dt><dd>A group of related pieces, with a pillar piece and several supporting pieces linked together, covering a topic in depth.</dd>
<dt>Evergreen content</dt><dd>A piece that stays useful long after publication, such as a guide or an explainer. It needs periodic reviews.</dd>
<dt>Exit criteria</dt><dd>The condition a piece must meet to move from one workflow stage to the next.</dd>
<dt>Structured data</dt><dd>Markup in the page code that describes its content to search engines: piece type, headline, image, dates, authorship or FAQs.</dd>
<dt>Destination</dt><dd>Each place a piece is published: a site, a newsletter, a social network or a partner feed, with its own format and timing rules.</dd>
<dt>Brief</dt><dd>The document that defines a piece before it is written: topic, angle, target query, format, sources, destinations, deadline and owners.</dd>
<dt>Canonical tag</dt><dd>A signal telling search engines which is the main version of content published at several URLs.</dd>
<dt>Pre-publication checklist</dt><dd>A short set of verifiable checks a piece must pass before approval. Part of it can be automated.</dd>
<dt>Meta description</dt><dd>A short summary of the piece that search engines may show under the title in their results.</dd>
<dt>Fast lane</dt><dd>A shortened version of the workflow for urgent pieces, with only the essential checks and the same requirement for human approval.</dd>
<dt>Alt text</dt><dd>A text description of an image for people who cannot see it and for when the image fails to load.</dd>
<dt>Reference version</dt><dd>The approved version of a piece from which each destination's version is derived. Corrections are made on it.</dd>
</dl>
`;
