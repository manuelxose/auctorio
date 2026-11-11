// Part 2 of the "Editorial workflow" guide (sections 9–12).
export const PART_2 = `
<h2 id="editorial-seo">Editorial SEO inside the workflow</h2>
<p>Editorial SEO is not a trick to fool search engines; it is the set of decisions that help a useful piece get found by the people who need it. The key is to spread those decisions across the workflow instead of piling them up at the end. That way each person does a small part at the moment they have the information to do it well.</p>
<h3>At planning: topic and intent</h3>
<p>The most important SEO decision is made before a single word is written: which query the piece will answer and whether your publication already has a piece that answers it. Publishing two pieces that compete for the same query splits authority between them and confuses readers. Before assigning, check whether you already own a piece on the topic; if it exists and is out of date, update it instead of creating another.</p>
<h3>At assignment: target query and related pieces</h3>
<p>The brief should include the target query, the related questions worth answering and the existing pieces to link to. With that, the reporter can write for the reader and for search at the same time, without guessing what the audience team expects.</p>
<h3>At writing: structure that answers</h3>
<ul>
<li><strong>Answer early.</strong> The first paragraph should answer the main question. A reader searching "when is the bonus paid" wants the date, not a history lesson.</li>
<li><strong>Descriptive subheadings.</strong> Subheadings should say what each section contains. They help skimming, screen-reader navigation and search engines' understanding of the piece.</li>
<li><strong>One topic per piece.</strong> If the text starts answering a different query, it is probably a supporting piece that deserves its own brief.</li>
<li><strong>Real depth.</strong> Length is not a goal. A piece should be as long as it needs to answer well, and add something that is not already in the top results: original data, context, experience, examples.</li>
</ul>
<h3>At preparation: the technical elements</h3>
<table>
<thead><tr><th>Element</th><th>Practical recommendation</th></tr></thead>
<tbody>
<tr><td>SEO title</td><td>Clear, with the main query near the start when it reads naturally. Around 50 to 60 characters so it is not truncated in most results.</td></tr>
<tr><td>Homepage headline</td><td>Can differ and be more editorial, but must not promise something the piece does not deliver.</td></tr>
<tr><td>Meta description</td><td>Summarises what the reader will find in about 150 to 160 characters. It does not guarantee the search engine will show it, but it helps when it does.</td></tr>
<tr><td>URL</td><td>Short, readable and dateless if the piece will be updated. Never changed after publishing except with a permanent redirect.</td></tr>
<tr><td>Lead image</td><td>Good quality, relevant and at least 1,200 pixels wide if you want to qualify for large-image formats in search and recommendation feeds.</td></tr>
<tr><td>Alt text</td><td>Describes the image for people who cannot see it. It is not a place to repeat keywords.</td></tr>
<tr><td>Internal links</td><td>Two to five links to relevant pieces of your own, with descriptive anchor text.</td></tr>
<tr><td>Structured data</td><td>Article or news markup with headline, image, publication and modification dates, and authorship. FAQ markup only when the piece genuinely contains questions and answers.</td></tr>
<tr><td>Authorship</td><td>A visible byline linking to an author page that explains who they are and why they know the subject.</td></tr>
</tbody>
</table>
<h3>Honest dates</h3>
<p>The modified date should change when the piece changes meaningfully, not every time someone fixes a comma, and never automatically to look fresher. Search engines and readers notice inflated dates, and a piece that claims to be updated today but contains two-year-old data loses credibility.</p>
<h3>Page performance</h3>
<p>Page experience is also part of the workflow, even if it depends more on the technical team than on the newsroom. The Core Web Vitals used by Google consider good a main-content load under 2.5 seconds, an interaction response under 200 milliseconds and a cumulative layout shift below 0.1. What the newsroom does control is image weight, the number of embeds and how much advertising or how many modules get added to each piece. The checklist should at least include that images are compressed and have defined dimensions.</p>
<h3>Experience, expertise, authority and trust</h3>
<p>Search engines' quality guidelines stress the experience, expertise, authoritativeness and trustworthiness of content. In practice that translates into workflow decisions: bylines with real names, linked sources, a methodology note when there is original data, visible corrections, showing who edits, and author and newsroom pages that explain who is behind the publication. None of this requires special technology; it only requires someone to own the task of checking it.</p>

<h2 id="checklist">Quality control: the pre-publication checklist</h2>
<p>The pre-publication checklist has the best effort-to-result ratio in the whole workflow. Designed well, it prevents most visible errors without slowing work down. Designed badly, it becomes a formality that everyone ticks without reading.</p>
<h3>Principles of a good checklist</h3>
<ul>
<li><strong>Short:</strong> between eight and fifteen items. With forty, nobody follows it.</li>
<li><strong>Verifiable:</strong> each item can be checked with a yes or no. "Good quality" is not verifiable; "title of 60 characters or fewer" is.</li>
<li><strong>Automated where possible:</strong> title length, presence of a meta description, image alt text or valid structured data can be checked automatically. People should spend their attention on what a machine cannot judge.</li>
<li><strong>Blocking only for serious issues:</strong> separate warnings from blockers. An image without alt text can block publishing; a suggestion for an extra internal link should not.</li>
<li><strong>Adapted to the format:</strong> breaking news does not need the same checklist as a long read.</li>
</ul>
<h3>Example checklist for a standard article</h3>
<ol>
<li>The first paragraph answers the brief's main question.</li>
<li>Every figure, date and quote has an identified source.</li>
<li>Primary sources are linked when they are public.</li>
<li>The SEO title is 60 characters or fewer and contains the main query.</li>
<li>The meta description exists and is 160 characters or fewer.</li>
<li>The lead image has usage rights, is at least 1,200 pixels wide and has alt text.</li>
<li>There are at least two internal links to related pieces.</li>
<li>The article structured data is valid and the dates are correct.</li>
<li>The piece has a byline linking to an author page.</li>
<li>The spell checker finds no errors.</li>
<li>The versions for each channel are prepared and reviewed.</li>
<li>The editor has reviewed the piece and there are no open comments.</li>
</ol>
<h3>Who runs the checklist</h3>
<p>Ideally the checklist runs twice: the writer or whoever prepares the piece goes through it before requesting approval, and the approver sees the result of the automated checks next to the text at the moment of approving. If the system shows the draft and the status of every check on a single screen, approval stops being an act of faith and becomes an informed decision.</p>
<aside class="callout"><p><strong>Review the checklist every quarter.</strong> Look at which errors reached readers in the last three months and ask whether a checklist item would have caught them. Add that item and remove the ones that never catch anything. A checklist is a living document.</p></aside>

<h2 id="multichannel">Multi-channel and multi-site publishing</h2>
<p>Publishing is no longer pressing a button in the CMS. One piece can go out on the main site, on a sister site with a local angle, in a newsletter, on several social networks, in aggregators and on partner sites that republish content. Each destination has its own format, ideal timing and rules. Doing it by hand is a constant source of errors.</p>
<h3>One piece, several outputs</h3>
<p>The principle that works best is to keep a single reference version of the piece, the approved one, and derive the version for each destination from it. If the reference version is corrected, the correction propagates or, at least, you are told which destinations have an older version. The opposite, copying and pasting the text into each place, guarantees that sooner or later there will be different versions of the same information.</p>
<h3>Rules per destination</h3>
<table>
<thead><tr><th>Destination</th><th>Usual format</th><th>Rules to define</th></tr></thead>
<tbody>
<tr><td>Main site</td><td>Full piece with structured data.</td><td>Section, tags, byline, publishing time.</td></tr>
<tr><td>Sister or local site</td><td>Adapted or summarised version.</td><td>Which parts are kept; canonical link to the original if the text is nearly identical.</td></tr>
<tr><td>Newsletter</td><td>Summary with a link.</td><td>Which edition it goes into and with which headline.</td></tr>
<tr><td>Text-based social network</td><td>Thread or short post.</td><td>Number of posts, tone, timing.</td></tr>
<tr><td>Visual social network</td><td>Carousel or image with text.</td><td>Design, number of cards, supporting copy.</td></tr>
<tr><td>Partners and aggregators</td><td>Headline, summary and link, or full piece.</td><td>Which fields are shared and under which licence.</td></tr>
</tbody>
</table>
<h3>Duplicate content across sites</h3>
<p>When a group publishes the same text on several sites, decide which version is the original and signal it with a canonical tag on the others. If each site adapts the text substantially, with local data or a different angle, it can have its own indexable version. What you should avoid is publishing near-identical texts on several sites without any signal, because they compete with each other in search results.</p>
<h3>When publishing fails</h3>
<p>Publishing fails: an application password expires, a social network changes its API, a server does not respond. The workflow must define what happens then. The sensible approach is for the system to retry automatically a reasonable number of times, alert a specific person if the failure persists, and show clearly on the piece's record where it was published and where it was not. Discovering days later that a piece never went out on one of the sites is one of the most frustrating and most avoidable failures.</p>
<h3>Scheduling and timing</h3>
<p>Each channel has its own peak hours, and they rarely coincide. Scheduling each destination separately, instead of publishing everything at once, improves reach at no extra cost. The publishing calendar should show every scheduled output for every site and channel in a single view, so gaps and overloads are easy to spot.</p>

<h2 id="updates">Updating evergreen content</h2>
<p>A significant share of a publisher's search traffic usually lands on pieces that are not news: service guides, explainers, FAQs, resource lists. They stay useful for months or years as long as they are kept up to date. Treating them like news, published and forgotten, wastes one of the newsroom's most valuable assets.</p>
<h3>How to find what to update</h3>
<ul>
<li><strong>Pieces losing traffic:</strong> if a guide that brought steady visits starts falling, it may be out of date or another piece may answer the query better.</li>
<li><strong>Pieces with stale data:</strong> figures, prices, deadlines or rules that change every year.</li>
<li><strong>Seasonal pieces:</strong> school calendars, tax seasons, holidays or annual events that should be updated before the search season starts.</li>
<li><strong>Cannibalising pieces:</strong> several of your own pieces answering the same query that should be merged into one.</li>
</ul>
<h3>The update workflow</h3>
<p>Updating a piece should follow a workflow similar to a new piece, only shorter: an update brief listing what to review, an edit, the pre-publication checks and an approval. The URL stays the same, the modified date changes only if the change is meaningful, and readers should be told what was updated and when.</p>
<h3>Merge and retire</h3>
<p>Not everything deserves updating. When several pieces cover the same thing, the usual approach is to keep the best one, fold in what is useful from the others and redirect the old ones to it with a permanent redirect. Pieces that no longer make sense and get no visits can be retired, returning the appropriate status code or redirecting to a related piece if one exists. A smaller, well-maintained archive usually performs better than a huge one full of stale pieces.</p>
<h3>A review calendar</h3>
<p>Give every evergreen piece a review date based on how fast its content goes stale: three months for pieces with prices or changing regulation, six months for general guides, a year for background explainers. The editorial system can flag pieces when they reach their date, so the update enters weekly planning like any other assignment.</p>
`;
