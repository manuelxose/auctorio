// Part 4 of the "Editorial workflow" guide (metrics, tools, mistakes, 30-day plan, conclusion) and its FAQ.
export const PART_4 = `
<h2 id="metrics">Metrics to measure an editorial workflow</h2>
<p>What is not measured cannot be improved, but measuring the wrong thing is worse than not measuring at all. Editorial workflow metrics should answer two questions: whether the process works, meaning pieces move forward without bottlenecks or errors, and whether the output works, meaning pieces achieve their goal with readers.</p>
<h3>Process metrics</h3>
<table>
<thead><tr><th>Metric</th><th>What it shows</th><th>How to use it</th></tr></thead>
<tbody>
<tr><td>Time from assignment to publication</td><td>How long a piece takes to go through the workflow.</td><td>Compare it by format and section to find where it stretches.</td></tr>
<tr><td>Time in each stage</td><td>Where pieces pile up.</td><td>If pieces spend days in "ready for review", approval capacity is short.</td></tr>
<tr><td>Pieces returned in editing</td><td>Quality of briefs and drafts.</td><td>Many returns usually point to unclear briefs.</td></tr>
<tr><td>Checks failed before approval</td><td>Which errors appear most often.</td><td>Guide training and adjust templates.</td></tr>
<tr><td>Published errors</td><td>Failures that reach readers.</td><td>Review the checklist and the workflow when they appear.</td></tr>
<tr><td>Failed publishes per destination</td><td>Reliability of integrations.</td><td>Spot expired credentials or problematic channels.</td></tr>
<tr><td>Evergreen pieces reviewed on time</td><td>Health of the archive.</td><td>Plan capacity for updates.</td></tr>
</tbody>
</table>
<h3>Outcome metrics</h3>
<ul>
<li><strong>Search visibility:</strong> impressions, clicks and average position for each piece on its target query. Compare the query planned in the brief with the queries that actually bring traffic.</li>
<li><strong>Attention:</strong> engaged reading time and scroll depth, rather than page views on their own.</li>
<li><strong>Loyalty:</strong> whether readers come back, sign up for the newsletter or, if the publisher has a paid model, register or subscribe.</li>
<li><strong>Performance by channel:</strong> which destinations bring the most audience and of what quality.</li>
<li><strong>Shelf life:</strong> how much traffic a piece still receives weeks or months after publication.</li>
</ul>
<h3>Avoid vanity metrics</h3>
<p>The number of pieces published per day is easy to measure and tempting to maximise, but on its own it says nothing good. An increase in volume that does not translate into more attention, more visibility or more returning readers usually means you are publishing pieces that compete with each other or add nothing. It is more useful to track how many pieces pass a reasonable threshold of attention or visibility than how many get published.</p>
<h3>Regular reviews</h3>
<p>Metrics only help if someone looks at them regularly and makes decisions. A short weekly meeting to review process metrics and a monthly one for outcome metrics is usually enough. The question guiding both should not be "who failed?" but "which part of the workflow can we improve?".</p>

<h2 id="tools">Tools: how to choose editorial workflow software</h2>
<p>You can start an editorial workflow with a spreadsheet, a task board and a lot of discipline. Many newsrooms do for years. The problem appears as volume grows: information spreads across the board, the CMS, chat, email and several SEO tools, and keeping it all in sync becomes a job in itself.</p>
<h3>What a tool should solve</h3>
<ul>
<li><strong>A single record per piece:</strong> brief, draft, comments, images, versions, checks and publications in one place.</li>
<li><strong>Configurable stages:</strong> your newsroom's stages and owners, not a generic flow.</li>
<li><strong>Data-informed planning:</strong> help deciding what to cover based on search demand and your own archive.</li>
<li><strong>Automated checks:</strong> the mechanical part of the checklist, visible at the moment of approval.</li>
<li><strong>Recorded approval:</strong> who approved, when and which version.</li>
<li><strong>Multi-destination publishing:</strong> connections to your CMSs and channels, with rules per destination, retries and alerts.</li>
<li><strong>A shared calendar:</strong> every scheduled output for every site and channel.</li>
<li><strong>History:</strong> what was published, where, when and with what result.</li>
</ul>
<h3>Questions to ask before choosing</h3>
<ol>
<li>Does it integrate with the CMS we already use, or does it force us to change?</li>
<li>Can it manage several sites with different rules from the same workspace?</li>
<li>How does it use artificial intelligence, and what human control does it keep before publishing?</li>
<li>Where are our data and our sources' data processed?</li>
<li>What happens when a publish fails?</li>
<li>Can we export our content and history if we stop using it?</li>
<li>How long does the team need to start using it day to day?</li>
</ol>
<h3>CMS plugins, task tools and editorial platforms</h3>
<p>There are three broad approaches. The first is extending the CMS with workflow and SEO plugins: it works well with a single site but gets complicated with several. The second is combining a generic task management tool with the CMS: it is flexible, but information stays split and syncing is manual. The third is an editorial workflow platform that sits above one or more CMSs and channels and brings planning, production, review and publishing together. That is the approach of tools such as Auctorio, built for teams that publish to several sites and social networks and want SEO and AI to be part of the process, with mandatory human approval.</p>
<p>No tool fixes a workflow that has not been defined. Design the process first, even on paper, and then choose the tool that supports it best, not the other way round.</p>

<h2 id="mistakes">Common mistakes when designing an editorial workflow</h2>
<h3>1. Copying another publisher's workflow</h3>
<p>The workflow of a national daily with two hundred people does not suit a six-person topic site. Take inspiration from others, but design from your own formats, volume and team.</p>
<h3>2. Too many stages</h3>
<p>Every stage adds a move and a possible bottleneck. If a stage has no clear exit criteria and no owner different from the previous one, it is probably unnecessary.</p>
<h3>3. Collective approvals</h3>
<p>"The team reviews it" means nobody in particular reviews it. Every approval needs one person, with a named deputy for absences.</p>
<h3>4. SEO at the end</h3>
<p>Reviewing SEO once the piece is written, or worse, published, forces rework. Spreading it across planning, the brief and preparation is more effective and cheaper.</p>
<h3>5. Information outside the piece</h3>
<p>If the brief is in an email, the comments in chat and the images in a shared folder, nobody has the full picture. Everything that affects a piece should live with the piece.</p>
<h3>6. Ignoring emergencies</h3>
<p>A workflow that only works for planned pieces will be skipped the moment breaking news arrives, and once it is skipped, it is always skipped. Design a fast lane for emergencies from the start, with the essential checks only.</p>
<h3>7. Automating without supervision</h3>
<p>Automating checks and repetitive tasks is good; automating the decision to publish is not. AI and automated rules should prepare the work, not replace editorial judgement.</p>
<h3>8. Not measuring the process itself</h3>
<p>Many newsrooms measure audience obsessively and never the process that produces it. Without data on times, returns and errors, workflow improvements are based on impressions.</p>
<h3>9. Forgetting the archive</h3>
<p>A workflow that only considers new pieces lets the archive decay. Reserve capacity to update, merge and retire content.</p>
<h3>10. Rolling it all out at once</h3>
<p>Changing every stage, tool and responsibility at the same time creates resistance. Start with one format or section, learn and expand.</p>

<h2 id="30-day-plan">How to roll out an editorial workflow in 30 days</h2>
<p>Rolling out an editorial workflow does not require months of consultancy. With a clear plan and leadership commitment, you can have a first workflow running in four weeks and improve it afterwards with data.</p>
<h3>Week 1: understand how you work today</h3>
<ul>
<li>Pick three recent pieces in different formats and reconstruct their journey: who pitched the topic, who assigned it, how many versions there were, who approved it and where it was published.</li>
<li>Briefly interview a reporter, an editor, the SEO lead and the social lead. Ask where they lose the most time and which errors keep repeating.</li>
<li>Take an inventory of tools, sites and channels.</li>
<li>Collect the errors published in the last three months.</li>
</ul>
<h3>Week 2: design the workflow</h3>
<ul>
<li>Define the stages, with clear names and exit criteria for each.</li>
<li>Assign owners with a simple matrix and a single approver per stage.</li>
<li>Write the brief template and the pre-publication checklist, starting from the real errors you collected.</li>
<li>Define the fast lane for emergencies.</li>
<li>Decide the rules per destination for each site and channel.</li>
</ul>
<h3>Week 3: pilot with one section</h3>
<ul>
<li>Apply the workflow in a single section or format for a full week.</li>
<li>Use the tool you intend to keep, even if provisionally, so the pilot is realistic.</li>
<li>Record every friction: stages nobody understands, checklist items that add nothing, approvals that stall.</li>
<li>Adjust as you go and document the changes.</li>
</ul>
<h3>Week 4: expand and measure</h3>
<ul>
<li>Roll the workflow out to the other sections with short, practical training, ideally on real pieces rather than slides.</li>
<li>Switch on the basic process metrics: time from assignment to publication, time per stage, returns and published errors.</li>
<li>Schedule the first monthly review of the workflow.</li>
<li>Name a person responsible for maintaining the workflow, the brief template and the checklist.</li>
</ul>
<aside class="callout"><p><strong>Sign of success:</strong> by the end of the first month, anyone in the newsroom should be able to say what state any piece is in, what it is missing and who has to do it, without asking anyone.</p></aside>

<h2 id="conclusion">Conclusion</h2>
<p>An editorial workflow is not an end in itself. It is how a newsroom spends its energy on what matters, telling useful and reliable stories well, instead of on coordinating, chasing approvals or fixing avoidable errors. The publishers with the highest quality and reach are not necessarily the ones with the most people, but the ones that have turned their good practices into a shared process.</p>
<p>The principles are simple: clear stages with one owner each, a brief that travels with the piece, SEO spread across the process, AI as a help rather than a substitute for editorial judgement, a short and partly automated checklist, a recorded human approval, multi-channel publishing built on a single reference version, an archive that is kept alive, and metrics that measure both the outcome and the process.</p>
<p>Start with what hurts most today. If published errors are the problem, start with the checklist. If nobody knows what state each piece is in, start with the stages. If SEO is the problem, start with the brief. Every improvement makes the next one easier.</p>
<p>If you want to see all of this applied in a tool, Auctorio brings together planning from search demand, assisted writing, review with pre-publication checks, human approval and publishing to several sites and social networks in a single workspace.</p>
`;

export const FAQ = [
  {
    question: 'What is an editorial workflow?',
    answer:
      'It is the agreed sequence of stages, owners and criteria a piece goes through from the topic pitch to publication, distribution and updates. It defines who does what, when, and what must be true before a piece moves on.',
  },
  {
    question: 'How many stages should an editorial workflow have?',
    answer:
      'There is no fixed number. Most digital publishers do well with eight to ten stages grouped into plan, produce, approve and publish. Each stage needs clear exit criteria and an owner; if it has neither, it is probably unnecessary.',
  },
  {
    question: 'Who should approve a piece before it is published?',
    answer:
      'A specific person with editorial authority, usually an editor or section editor, different from the writer. The approval should be recorded with a name and a time, including when the piece was prepared with AI assistance.',
  },
  {
    question: 'Where does SEO fit in the editorial workflow?',
    answer:
      'In several stages: at planning you choose the target query and check whether you already own a piece on it; in the brief you list related questions and links; at preparation you review title, meta description, image, internal links and structured data; and after publishing you measure the result.',
  },
  {
    question: 'Can a newsroom use AI without losing quality?',
    answer:
      'Yes, if AI has a defined place in the workflow. It is useful for summarising documents, proposing outlines, headlines and alt text, or adapting pieces to other channels, always with facts verified against the original source and human approval before publishing.',
  },
  {
    question: 'What should a pre-publication checklist include?',
    answer:
      'Eight to fifteen verifiable items: the first paragraph answers the main question, figures have sources, title and meta description length, an image with rights and alt text, internal links, valid structured data, a byline and the editor sign-off.',
  },
  {
    question: 'How do you manage publishing to several sites?',
    answer:
      'Keep a single approved version of the piece and derive each destination version from it, with rules per site and channel, a canonical tag when texts are nearly identical, automatic retries when a publish fails and a record of where each piece was published.',
  },
  {
    question: 'How long does it take to roll out an editorial workflow?',
    answer:
      'A first workflow can be running in about four weeks: one to understand how you work today, one to design stages, owners, brief and checklist, one to pilot it in a section and one to roll it out and start measuring.',
  },
] as const;
