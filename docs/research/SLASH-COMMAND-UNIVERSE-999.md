# AETHERICA — Slash Command Universe (999 Unique Entries)

**Status:** Research inventory / candidate corpus. This is not a claim that all entries are native commands in ChatGPT or RIGOR-X. Native commands are platform-specific; macros and image keywords are community prompt conventions. **Unique normalized slash-token count: 999.**

## Method & counting rules

- Base corpus: `Cris0338/GPT-Slash-Prompts`, English catalogue, files `01`–`11`, branch `main`. Parsed 986 slash rows; collapsed 17 repeated tokens, yielding 969 unique slash tokens. The catalogue advertises 988 entries because it also counts a root slash-menu entry and an `@finances` mention entry, neither of which is a slash command token.
- Expansion: 30 additional unique native CLI commands documented by Aider, OpenCode and Gemini CLI. 969 + 30 = 999 unique command tokens.
- Same-name duplicates across categories are represented once. Alias spellings remain separate entries only when they are distinct tokens; their alias relationship is noted where available.
- A slash prefix does not imply universal execution support. Each item retains its source classification and platform/source provenance.

## Source register

- Community corpus: https://github.com/Cris0338/GPT-Slash-Prompts (English directory, files `01`–`11`, branch `main`).
- Aider official command reference: https://aider.chat/docs/usage/commands
- Gemini CLI official command reference: https://geminicli.com/docs/reference/commands/
- OpenCode TUI command reference: https://opencode.ai/docs/cli/tui/

## Grouped command inventory

### Aliases & shorthand variants (6)

1. **`/tldr`** — `/summarize` / `/brief` \| Produce a very short summary of the essential points. *[MACRO ALIAS; 11-aliases — alias/equivalent: /summarize]*
2. **`/step-by-step`** — `/stepbystep` \| Organize the answer into ordered steps. *[MACRO ALIAS; 11-aliases — alias/equivalent: /stepbystep]*
3. **`/executive-summary`** — `/executivebrief` \| Produce a concise executive-level summary. *[MACRO ALIAS; 11-aliases — alias/equivalent: /executivebrief]*
4. **`/pros-cons`** — `/proscons` \| Present advantages and disadvantages. *[MACRO ALIAS; 11-aliases — alias/equivalent: /proscons]*
5. **`/plainenglish`** — `/plain` / `/simplify` \| Explain in simple, plain language without unnecessary jargon. *[MACRO ALIAS; 11-aliases — alias/equivalent: /plain]*
6. **`/action-plan`** — `/actionplan` \| Create a concrete step-by-step action plan. *[MACRO ALIAS; 11-aliases — alias/equivalent: /actionplan]*

### Communication, email & social messaging (26)

7. **`/email`** — Write a complete email. *[MACRO; 03-writing-languages-communication]*
8. **`/reply`** — Write a reply to the given message. *[MACRO; 03-writing-languages-communication]*
9. **`/followup`** — Write a follow-up message. *[MACRO; 03-writing-languages-communication]*
10. **`/reminder`** — Write a reminder to send. *[MACRO; 03-writing-languages-communication]*
11. **`/request`** — Write a clear and polite request. *[MACRO; 03-writing-languages-communication]*
12. **`/complaint`** — Write a structured and documented complaint. *[MACRO; 03-writing-languages-communication]*
13. **`/apology`** — Write an appropriate apology message. *[MACRO; 03-writing-languages-communication]*
14. **`/thanks`** — Write a thank-you message. *[MACRO; 03-writing-languages-communication]*
15. **`/invitation`** — Write an invitation. *[MACRO; 03-writing-languages-communication]*
16. **`/whatsapp`** — Write a short message suitable for WhatsApp. *[MACRO; 03-writing-languages-communication]*
17. **`/sms`** — Write a concise SMS message. *[MACRO; 03-writing-languages-communication]*
18. **`/dm`** — Write a direct message for social/chat. *[MACRO; 03-writing-languages-communication]*
19. **`/slack`** — Write a Slack-friendly message. *[MACRO; 03-writing-languages-communication]*
20. **`/discord`** — Write a Discord-friendly message. *[MACRO; 03-writing-languages-communication]*
21. **`/linkedin`** — Write or adapt a LinkedIn post/message. *[MACRO; 03-writing-languages-communication]*
22. **`/facebook`** — Write or adapt a Facebook post. *[MACRO; 03-writing-languages-communication]*
23. **`/instagram`** — Write a caption or Instagram post. *[MACRO; 03-writing-languages-communication]*
24. **`/xpost`** — Write a short post for X/Twitter. *[MACRO; 03-writing-languages-communication]*
25. **`/thread`** — Organize content as a post thread. *[MACRO; 03-writing-languages-communication]*
26. **`/announcement`** — Write an announcement. *[MACRO; 03-writing-languages-communication]*
27. **`/subject`** — Generate an email subject line. *[MACRO; 03-writing-languages-communication]*
28. **`/cta`** — Create a clear call to action. *[MACRO; 03-writing-languages-communication]*
29. **`/soften`** — Make the message less abrupt. *[MACRO; 03-writing-languages-communication]*
30. **`/firm`** — Make the message firm but professional. *[MACRO; 03-writing-languages-communication]*
31. **`/diplomatic`** — Make the message diplomatic and non-confrontational. *[MACRO; 03-writing-languages-communication]*
32. **`/viral`** — Optimize content for clarity, engagement, and social shareability. *[MACRO; 03-writing-languages-communication]*

### Comparison, evaluation & decision support (22)

33. **`/compare`** — Compare two or more options using explicit criteria. *[MACRO; 02-search-analysis]*
34. **`/versus`** — Direct comparison: A vs B. *[MACRO; 02-search-analysis]*
35. **`/differences`** — Highlight only meaningful differences. *[MACRO; 02-search-analysis]*
36. **`/similarities`** — Highlight similarities. *[MACRO; 02-search-analysis]*
37. **`/matrix`** — Create a comparison matrix. *[MACRO; 02-search-analysis]*
38. **`/criteria`** — Define the most relevant criteria for the comparison. *[MACRO; 02-search-analysis]*
39. **`/benchmark`** — Set up a performance comparison based on metrics. *[MACRO; 02-search-analysis]*
40. **`/costbenefit`** — Analyze costs and benefits. *[MACRO; 02-search-analysis]*
41. **`/tco`** — Calculate or estimate total cost of ownership. *[MACRO; 02-search-analysis]*
42. **`/roi`** — Calculate or discuss return on investment. *[MACRO; 02-search-analysis]*
43. **`/value`** — Analyze the relationship between utility, performance, and cost. *[MACRO; 02-search-analysis]*
44. **`/specs`** — Compare technical specifications. *[MACRO; 02-search-analysis]*
45. **`/compatibility`** — Check compatibility between components or systems. *[MACRO; 02-search-analysis]*
46. **`/alternatives`** — Propose comparable alternatives. *[MACRO; 02-search-analysis]*
47. **`/upgradepath`** — Evaluate the future upgrade path. *[MACRO; 02-search-analysis]*
48. **`/bottleneck`** — Identify the main bottleneck. *[MACRO; 02-search-analysis]*
49. **`/performance`** — Focus on measurable performance. *[MACRO; 02-search-analysis]*
50. **`/efficiency`** — Focus on energy or operational efficiency. *[MACRO; 02-search-analysis]*
51. **`/reliability`** — Focus on reliability and robustness. *[MACRO; 02-search-analysis]*
52. **`/maintainability`** — Evaluate ease of maintenance and repair. *[MACRO; 02-search-analysis]*
53. **`/scalability`** — Evaluate the ability to scale. *[MACRO; 02-search-analysis]*
54. **`/futureproof`** — Evaluate how long a solution is likely to remain adequate over time. *[MACRO; 02-search-analysis]*

### Documents, projects & automation (46)

55. **`/document`** — Create or structure a document. *[MACRO; 06-documents-projects-automations]*
56. **`/docx`** — Create or edit a Word/DOCX document. *[MACRO; 06-documents-projects-automations]*
57. **`/pdf`** — Create, analyze, or edit a PDF. *[MACRO; 06-documents-projects-automations]*
58. **`/pdfread`** — Read and analyze the contents of a PDF. *[MACRO; 06-documents-projects-automations]*
59. **`/pdfextract`** — Extract text, tables or images from a PDF. *[MACRO; 06-documents-projects-automations]*
60. **`/pdfmerge`** — Merge multiple PDFs. *[MACRO; 06-documents-projects-automations]*
61. **`/pdfsplit`** — Split a PDF. *[MACRO; 06-documents-projects-automations]*
62. **`/pdfcompress`** — Reduce the size of a PDF when possible. *[MACRO; 06-documents-projects-automations]*
63. **`/pdfocr`** — Make a scanned PDF searchable via OCR. *[MACRO; 06-documents-projects-automations]*
64. **`/pdfredact`** — Prepare a real redaction/removal of content from the PDF. *[MACRO; 06-documents-projects-automations]*
65. **`/spreadsheet`** — Create or edit a spreadsheet. *[MACRO; 06-documents-projects-automations]*
66. **`/xlsx`** — Create or edit an Excel/XLSX file. *[MACRO; 06-documents-projects-automations]*
67. **`/sheet`** — Work on a specific sheet/tab. *[MACRO; 06-documents-projects-automations]*
68. **`/formulaexcel`** — Write or correct Excel/Sheets formulas. *[MACRO; 06-documents-projects-automations]*
69. **`/pivotexcel`** — Design a pivot table. *[MACRO; 06-documents-projects-automations]*
70. **`/chart-excel`** — Create or correct a chart in a spreadsheet. *[MACRO; 06-documents-projects-automations]*
71. **`/presentation`** — Create or structure a presentation. *[MACRO; 06-documents-projects-automations]*
72. **`/pptx`** — Create or edit a PowerPoint/PPTX. *[MACRO; 06-documents-projects-automations]*
73. **`/slides`** — Work on a slide presentation. *[MACRO; 06-documents-projects-automations]*
74. **`/speaker-notes`** — Write notes for the speaker. *[MACRO; 06-documents-projects-automations]*
75. **`/handout`** — Prepare a printable/summary version of the slides. *[MACRO; 06-documents-projects-automations]*
76. **`/report`** — Create a structured report. *[MACRO; 06-documents-projects-automations]*
77. **`/memo`** — Create a concise memo. *[MACRO; 06-documents-projects-automations]*
78. **`/letter`** — Create a formal or informal letter. *[MACRO; 06-documents-projects-automations]*
79. **`/form`** — Create or structure a form. *[MACRO; 06-documents-projects-automations]*
80. **`/convert`** — Convert content between formats when technically possible. *[MACRO; 06-documents-projects-automations]*
81. **`/extracttable`** — Extract a table from a document or image. *[MACRO; 06-documents-projects-automations]*
82. **`/layout`** — Analyze or correct layout and visual structure. *[MACRO; 06-documents-projects-automations]*
83. **`/paginate`** — Set or control pagination. *[MACRO; 06-documents-projects-automations]*
84. **`/printlayout`** — Optimize the document for printing. *[MACRO; 06-documents-projects-automations]*
85. **`/drive`** — Search or work on linked Google Drive files. *[MACRO; 06-documents-projects-automations]*
86. **`/gdoc`** — Work on a Google Doc. *[MACRO; 06-documents-projects-automations]*
87. **`/gsheet`** — Work on a Google Sheet. *[MACRO; 06-documents-projects-automations]*
88. **`/gslides`** — Work on Google Slides. *[MACRO; 06-documents-projects-automations]*
89. **`/gmail`** — Search, read, prepare, or manage authorized Gmail emails. *[MACRO; 06-documents-projects-automations]*
90. **`/inbox`** — Analyze or organize your inbox. *[MACRO; 06-documents-projects-automations]*
91. **`/draft`** — Create an email draft. *[MACRO; 06-documents-projects-automations]*
92. **`/calendar`** — View or modify Google Calendar if authorized. *[MACRO; 06-documents-projects-automations]*
93. **`/availability`** — Search availability on the calendar. *[MACRO; 06-documents-projects-automations]*
94. **`/event`** — Create or edit a calendar event. *[MACRO; 06-documents-projects-automations]*
95. **`/automation`** — Set a recurring or conditional request. *[MACRO; 06-documents-projects-automations]*
96. **`/monitor`** — Periodically check a condition when configured as an automation. *[MACRO; 06-documents-projects-automations]*
97. **`/notify`** — Send a notification when a configured condition becomes true. *[MACRO; 06-documents-projects-automations]*
98. **`/daily`** — Set or describe a daily recurrence. *[MACRO; 06-documents-projects-automations]*
99. **`/weekly`** — Set or describe a weekly recurrence. *[MACRO; 06-documents-projects-automations]*
100. **`/monthly`** — Set or describe a monthly recurrence. *[MACRO; 06-documents-projects-automations]*

### Education, learning & tutoring (27)

101. **`/teach`** — Teach the topic with a didactic structure. *[MACRO; 04-science-data]*
102. **`/eli5`** — Explain in a very simple and intuitive way. *[MACRO; 04-science-data]*
103. **`/beginner`** — Explain at beginner level. *[MACRO; 04-science-data]*
104. **`/intermediate`** — Explain at an intermediate level. *[MACRO; 04-science-data]*
105. **`/advanced`** — Explain at an advanced level. *[MACRO; 04-science-data]*
106. **`/expert`** — Use expert-level technical depth. *[MACRO; 04-science-data]*
107. **`/lesson`** — Create a complete lesson. *[MACRO; 04-science-data]*
108. **`/course`** — Structure a progressive mini-course. *[MACRO; 04-science-data]*
109. **`/studyplan`** — Create a study plan. *[MACRO; 04-science-data]*
110. **`/syllabus`** — Create a lesson plan by topic. *[MACRO; 04-science-data]*
111. **`/quiz`** — Generate a quiz. *[MACRO; 04-science-data]*
112. **`/mcq`** — Generate multiple-choice questions. *[MACRO; 04-science-data]*
113. **`/truefalse`** — Generate true/false questions. *[MACRO; 04-science-data]*
114. **`/flashcards`** — Generate question/answer flashcards. *[MACRO; 04-science-data]*
115. **`/exercises`** — Generate exercises. *[MACRO; 04-science-data]*
116. **`/solutions`** — Provide explained solutions. *[MACRO; 04-science-data]*
117. **`/workedexample`** — Show a complete worked example. *[MACRO; 04-science-data]*
118. **`/analogy`** — Use analogies to explain. *[MACRO; 04-science-data]*
119. **`/memoryaid`** — Create a mnemonic aid. *[MACRO; 04-science-data]*
120. **`/cheatsheet`** — Create a quick-reference sheet. *[MACRO; 04-science-data]*
121. **`/formula-sheet`** — Create a formula sheet. *[MACRO; 04-science-data]*
122. **`/questions-to-study`** — Generate useful questions to check understanding. *[MACRO; 04-science-data]*
123. **`/oralexam`** — Simulate an oral exam. *[MACRO; 04-science-data]*
124. **`/socratic`** — Guide learning through progressive questions. *[MACRO; 04-science-data]*
125. **`/recap`** — Recap what has been learned. *[MACRO; 04-science-data]*
126. **`/ells`** — Explain a concept clearly, simply, and accessibly, avoiding unnecessary technicalities. *[MACRO; 04-science-data]*
127. **`/interview`** — Prepare questions, answers, and key points for a job interview. *[MACRO; 04-science-data]*

### General-purpose AI workflows (30)

128. **`/cmd`** — Provide commands for Windows Command Prompt. *[MACRO; 05-code-systems-github]*
129. **`/terminal`** — Provide terminal commands appropriate for the system. *[MACRO; 05-code-systems-github]*
130. **`/linux`** — Use Linux tools and paths. *[MACRO; 05-code-systems-github]*
131. **`/windows`** — Use Windows tools and paths. *[MACRO; 05-code-systems-github]*
132. **`/macos`** — Use macOS tools and paths. *[MACRO; 05-code-systems-github]*
133. **`/ubuntu`** — Adapt commands to Ubuntu. *[MACRO; 05-code-systems-github]*
134. **`/debian`** — Adapt commands to Debian. *[MACRO; 05-code-systems-github]*
135. **`/archlinux`** — Adapt commands to Arch Linux. *[MACRO; 05-code-systems-github]*
136. **`/files`** — Work with files and folders. *[MACRO; 05-code-systems-github]*
137. **`/findfile`** — Find files by name or criteria. *[MACRO; 05-code-systems-github]*
138. **`/grep`** — Search for text in files. *[MACRO; 05-code-systems-github]*
139. **`/sed`** — Use sed for text transformations. *[MACRO; 05-code-systems-github]*
140. **`/awk`** — Use awk for text or tabular processing. *[MACRO; 05-code-systems-github]*
141. **`/permissions`** — Analyze file or user permissions. *[MACRO; 05-code-systems-github]*
142. **`/processes`** — Analyze running processes. *[MACRO; 05-code-systems-github]*
143. **`/services`** — Analyze system services. *[MACRO; 05-code-systems-github]*
144. **`/systemd`** — Work with systemd units and services. *[MACRO; 05-code-systems-github]*
145. **`/logs`** — Analyze system or application logs. *[MACRO; 05-code-systems-github]*
146. **`/network`** — Analyze network configuration and problems. *[MACRO; 05-code-systems-github]*
147. **`/ip`** — Analyze IP addresses and configuration. *[MACRO; 05-code-systems-github]*
148. **`/dns`** — Analyze DNS problems. *[MACRO; 05-code-systems-github]*
149. **`/ports`** — Analyze network ports and services. *[MACRO; 05-code-systems-github]*
150. **`/curl`** — Construct curl commands. *[MACRO; 05-code-systems-github]*
151. **`/ssh`** — Build SSH commands and configurations. *[MACRO; 05-code-systems-github]*
152. **`/rsync`** — Build rsync commands. *[MACRO; 05-code-systems-github]*
153. **`/scp`** — Build scp commands. *[MACRO; 05-code-systems-github]*
154. **`/ffmpeg`** — Build FFmpeg commands for audio/video. *[MACRO; 05-code-systems-github]*
155. **`/imagemagick`** — Construct ImageMagick commands. *[MACRO; 05-code-systems-github]*
156. **`/ocr`** — Set up an OCR procedure for images or PDFs. *[MACRO; 05-code-systems-github]*
157. **`/backup`** — Design a backup procedure. *[MACRO; 05-code-systems-github]*

### Hardware, maker & digital fabrication (32)

158. **`/laser`** — Analyze laser processing, parameters, and strategy. *[MACRO; 09-maker-laser-cnc-3d]*
159. **`/falcon`** — Adapt the work to the Creality Falcon A1 Pro 20W. *[MACRO; 09-maker-laser-cnc-3d]*
160. **`/engrave`** — Set or analyze engraving parameters. *[MACRO; 09-maker-laser-cnc-3d]*
161. **`/cut`** — Set or analyze cutting parameters. *[MACRO; 09-maker-laser-cnc-3d]*
162. **`/fill`** — Set or analyze full-fill engraving. *[MACRO; 09-maker-laser-cnc-3d]*
163. **`/passes`** — Consider the number of passes. *[MACRO; 09-maker-laser-cnc-3d]*
164. **`/speed`** — Consider the processing speed. *[MACRO; 09-maker-laser-cnc-3d]*
165. **`/powerpercent`** — Consider the laser power percentage. *[MACRO; 09-maker-laser-cnc-3d]*
166. **`/airassist`** — Consider the use and adjustment of air assist. *[MACRO; 09-maker-laser-cnc-3d]*
167. **`/focus`** — Consider focus and Z-height. *[MACRO; 09-maker-laser-cnc-3d]*
168. **`/kerf`** — Analyze cutting width/kerf. *[MACRO; 09-maker-laser-cnc-3d]*
169. **`/testgrid`** — Design a speed/power test matrix. *[MACRO; 09-maker-laser-cnc-3d]*
170. **`/materialtest`** — Design a controlled material test. *[MACRO; 09-maker-laser-cnc-3d]*
171. **`/lightburn`** — Work with LightBurn settings, layers, and workflows. *[MACRO; 09-maker-laser-cnc-3d]*
172. **`/svg`** — Create or fix an SVG file. *[MACRO; 09-maker-laser-cnc-3d]*
173. **`/dxf`** — Create or correct a DXF file. *[MACRO; 09-maker-laser-cnc-3d]*
174. **`/vector`** — Prepare vector geometries for machining. *[MACRO; 09-maker-laser-cnc-3d]*
175. **`/nesting`** — Optimize the arrangement of pieces on the material. *[MACRO; 09-maker-laser-cnc-3d]*
176. **`/cnc`** — Analyze CNC machining. *[MACRO; 09-maker-laser-cnc-3d]*
177. **`/toolpath`** — Plan toolpaths. *[MACRO; 09-maker-laser-cnc-3d]*
178. **`/feedspeeds`** — Calculate or estimate CNC feeds and speeds. *[MACRO; 09-maker-laser-cnc-3d]*
179. **`/gcode`** — Generate or analyze G-code. *[MACRO; 09-maker-laser-cnc-3d]*
180. **`/3dprint`** — Analyze a 3D print job. *[MACRO; 09-maker-laser-cnc-3d]*
181. **`/fdm`** — Set up or discuss FDM printing. *[MACRO; 09-maker-laser-cnc-3d]*
182. **`/resinprint`** — Set up or discuss resin 3D printing. *[MACRO; 09-maker-laser-cnc-3d]*
183. **`/slicer`** — Analyze slicer settings. *[MACRO; 09-maker-laser-cnc-3d]*
184. **`/layerheight`** — Select or analyze layer height. *[MACRO; 09-maker-laser-cnc-3d]*
185. **`/infill`** — Select or analyze infill percentage and pattern. *[MACRO; 09-maker-laser-cnc-3d]*
186. **`/supports`** — Plan print supports. *[MACRO; 09-maker-laser-cnc-3d]*
187. **`/orientation`** — Select part orientation. *[MACRO; 09-maker-laser-cnc-3d]*
188. **`/stl`** — Analyze or prepare STL geometry. *[MACRO; 09-maker-laser-cnc-3d]*
189. **`/printability`** — Check printability and geometric criticalities. *[MACRO; 09-maker-laser-cnc-3d]*

### Information extraction & knowledge organization (47)

190. **`/summarize`** — Summarize the content. *[MACRO; 03-writing-languages-communication]*
191. **`/tl;dr`** — Produces an extremely short summary. *[MACRO; 03-writing-languages-communication]*
192. **`/keypoints`** — Extract key points. *[MACRO; 03-writing-languages-communication]*
193. **`/takeaways`** — Highlight what is worth remembering. *[MACRO; 03-writing-languages-communication]*
194. **`/extract`** — Extracts specific information from text or files. *[MACRO; 03-writing-languages-communication]*
195. **`/entities`** — Extracts named people, companies, places, products, or entities. *[MACRO; 03-writing-languages-communication]*
196. **`/dates`** — Extracts dates and time references. *[MACRO; 03-writing-languages-communication]*
197. **`/numbers`** — Extracts numbers, measurements, quantities and values. *[MACRO; 03-writing-languages-communication]*
198. **`/quotes`** — Extracts relevant quotes, respecting copyright restrictions. *[MACRO; 03-writing-languages-communication]*
199. **`/actions`** — Extracts actions to be performed. *[MACRO; 03-writing-languages-communication]*
200. **`/todos`** — Convert content into to-do items. *[MACRO; 03-writing-languages-communication]*
201. **`/decisions`** — Extracts decisions made or to be made. *[MACRO; 03-writing-languages-communication]*
202. **`/questions`** — Extracts open-ended questions. *[MACRO; 03-writing-languages-communication]*
203. **`/issues`** — Extracts problems or critical issues. *[MACRO; 03-writing-languages-communication]*
204. **`/requirements`** — Extracts explicit and implicit requirements. *[MACRO; 03-writing-languages-communication]*
205. **`/constraints-list`** — Extracts declared constraints. *[MACRO; 03-writing-languages-communication]*
206. **`/definitions`** — Extracts definitions and key terms. *[MACRO; 03-writing-languages-communication]*
207. **`/outline`** — Create a hierarchical outline. *[MACRO; 03-writing-languages-communication]*
208. **`/mindmap`** — Organize concepts as a text mind map. *[MACRO; 03-writing-languages-communication]*
209. **`/taxonomy`** — Create a hierarchical classification of concepts. *[MACRO; 03-writing-languages-communication]*
210. **`/categorize`** — Group items by category. *[MACRO; 03-writing-languages-communication]*
211. **`/deduplicate`** — Remove duplicates and merge equivalent entries. *[MACRO; 03-writing-languages-communication]*
212. **`/normalize`** — Standardize the form, units, names, or structure of data. *[MACRO; 03-writing-languages-communication]*
213. **`/sort`** — Sort the elements according to the requested criterion. *[MACRO; 03-writing-languages-communication]*
214. **`/chronological`** — Sort events or data chronologically. *[MACRO; 03-writing-languages-communication]*
215. **`/index`** — Create an index of topics or entries. *[MACRO; 03-writing-languages-communication]*
216. **`/plan`** — Create an operational plan. *[MACRO; 06-documents-projects-automations]*
217. **`/roadmap`** — Create a phased roadmap. *[MACRO; 06-documents-projects-automations]*
218. **`/milestones`** — Define milestones and intermediate results. *[MACRO; 06-documents-projects-automations]*
219. **`/tasks`** — Break the objective down into activities. *[MACRO; 06-documents-projects-automations]*
220. **`/subtasks`** — Break tasks down into subtasks. *[MACRO; 06-documents-projects-automations]*
221. **`/dependencies`** — Identify dependencies between activities. *[MACRO; 06-documents-projects-automations]*
222. **`/schedule`** — Create a time schedule. *[MACRO; 06-documents-projects-automations]*
223. **`/calendarplan`** — Organize activities on a calendar. *[MACRO; 06-documents-projects-automations]*
224. **`/weeklyplan`** — Create a weekly plan. *[MACRO; 06-documents-projects-automations]*
225. **`/dailyplan`** — Create a daily plan. *[MACRO; 06-documents-projects-automations]*
226. **`/kanban`** — Organize work as a Kanban board. *[MACRO; 06-documents-projects-automations]*
227. **`/backlog`** — Create or sort a backlog. *[MACRO; 06-documents-projects-automations]*
228. **`/sprint`** — Organize activities by sprint. *[MACRO; 06-documents-projects-automations]*
229. **`/estimate-time`** — Estimate duration and effort of activities. *[MACRO; 06-documents-projects-automations]*
230. **`/resources`** — List needed resources. *[MACRO; 06-documents-projects-automations]*
231. **`/budget`** — Prepare a budget or cost estimate. *[MACRO; 06-documents-projects-automations]*
232. **`/bom`** — Create a Bill of Materials. *[MACRO; 06-documents-projects-automations]*
233. **`/raci`** — Create a RACI matrix. *[MACRO; 06-documents-projects-automations]*
234. **`/retrospective`** — Analyze what worked, what did not, and what to improve. *[MACRO; 06-documents-projects-automations]*
235. **`/nextsteps`** — List concrete next steps. *[MACRO; 06-documents-projects-automations]*
236. **`/strategy`** — Set a medium/long-term strategy with objectives, priorities, and operational steps. *[MACRO; 06-documents-projects-automations]*

### Output format & response control (31)

237. **`/short`** — Very short answer, just the essentials. *[MACRO; 01-chatgpt-output]*
238. **`/concise`** — Compact but complete answer. *[MACRO; 01-chatgpt-output]*
239. **`/detailed`** — In-depth response with explanations and details. *[MACRO; 01-chatgpt-output]*
240. **`/deep`** — Very in-depth treatment, with implications and edge cases. *[MACRO; 01-chatgpt-output]*
241. **`/stepbystep`** — Organize the answer into orderly operational steps. *[MACRO; 01-chatgpt-output]*
242. **`/bullets`** — Use a bulleted list as the main format. *[MACRO; 01-chatgpt-output]*
243. **`/numbered`** — Use a numbered list as the main format. *[MACRO; 01-chatgpt-output]*
244. **`/table`** — Present data in tables when useful. *[MACRO; 01-chatgpt-output]*
245. **`/checklist`** — Converts output to a checkable checklist. *[MACRO; 01-chatgpt-output]*
246. **`/template`** — Returns a reusable template to fill in. *[MACRO; 01-chatgpt-output]*
247. **`/example`** — Adds a concrete example. *[MACRO; 01-chatgpt-output]*
248. **`/examples`** — Add more representative examples. *[MACRO; 01-chatgpt-output]*
249. **`/noexamples`** — Avoid examples and go straight to the explanation. *[MACRO; 01-chatgpt-output]*
250. **`/plain`** — Use plain text, without complex formatting. *[MACRO; 01-chatgpt-output]*
251. **`/markdown`** — Use clean and structured Markdown. *[MACRO; 01-chatgpt-output]*
252. **`/json`** — Returns data in valid JSON when applicable. *[MACRO; 01-chatgpt-output]*
253. **`/csv`** — Returns tabular data in CSV format. *[MACRO; 01-chatgpt-output]*
254. **`/yaml`** — Returns structured data in YAML. *[MACRO; 01-chatgpt-output]*
255. **`/xml`** — Returns structured data in XML. *[MACRO; 01-chatgpt-output]*
256. **`/codeblock`** — Inserts technical output into a code block. *[MACRO; 01-chatgpt-output]*
257. **`/copyready`** — Produces copy-ready text, without unnecessary comments. *[MACRO; 01-chatgpt-output]*
258. **`/printable`** — Sets a clean, print-friendly format. *[MACRO; 01-chatgpt-output]*
259. **`/a4`** — Fit structure and proportions to an A4 page. *[MACRO; 01-chatgpt-output]*
260. **`/a5`** — Fit structure and proportions to an A5 page. *[MACRO; 01-chatgpt-output]*
261. **`/landscape`** — Prefers horizontal layout. *[MACRO; 01-chatgpt-output]*
262. **`/portrait`** — Prefers vertical layout. *[MACRO; 01-chatgpt-output]*
263. **`/toc`** — Adds a structured index/table of contents. *[MACRO; 01-chatgpt-output]*
264. **`/glossary`** — Adds a glossary of terms used. *[MACRO; 01-chatgpt-output]*
265. **`/brief`** — Provides a short, focused answer to the essential points. *[MACRO; 01-chatgpt-output]*
266. **`/list`** — Organize content as a clear, structured list. *[MACRO; 01-chatgpt-output]*
267. **`/master`** — Refine the output with a final review for quality, consistency, clarity, and accuracy. *[MACRO; 01-chatgpt-output]*

### Platform-native commands & interface controls (34)

268. **`/finances`** — Opens/directs to the Finance function where available; uses authorized linked financial data. *[NATIVE; 01-chatgpt-output]*
269. **`/search`** — Conceptual shortcut for web search in the slash menu; the exact name displayed may vary by platform/version. *[UI/MENU; 01-chatgpt-output]*
270. **`/reason`** — Conceptual shortcut to start reasoning from the slash menu; availability and name may vary. *[UI/MENU; 01-chatgpt-output]*
271. **`/picture`** — Conceptual shortcut for generating images from the slash menu; availability and name may vary. *[UI/MENU; 01-chatgpt-output]*
272. **`/add`** — Add selected files to the active coding context. *[NATIVE; Aider]*
273. **`/architect`** — Switch to architect/editor workflow for planning code changes. *[NATIVE; Aider]*
274. **`/ask`** — Ask questions about a codebase without modifying files. *[NATIVE; Aider]*
275. **`/chat-mode`** — Switch the active chat mode. *[NATIVE; Aider]*
276. **`/copy-context`** — Copy current code context as Markdown. *[NATIVE; Aider]*
277. **`/drop`** — Remove files from the active context. *[NATIVE; Aider]*
278. **`/editor-model`** — Select the editor model used for code edits. *[NATIVE; Aider]*
279. **`/map-refresh`** — Force a repository map refresh. *[NATIVE; Aider]*
280. **`/multiline-mode`** — Toggle multiline message input. *[NATIVE; Aider]*
281. **`/ok`** — Confirm the proposed code change using the built-in shorthand. *[NATIVE; Aider]*
282. **`/paste`** — Paste clipboard image or text into the session. *[NATIVE; Aider]*
283. **`/read-only`** — Attach files as reference-only context. *[NATIVE; Aider]*
284. **`/reasoning-effort`** — Set the reasoning effort level for the active model. *[NATIVE; Aider]*
285. **`/run`** — Run a shell command and optionally attach output. *[NATIVE; Aider]*
286. **`/think-tokens`** — Set the thinking-token budget. *[NATIVE; Aider]*
287. **`/tokens`** — Report context token usage. *[NATIVE; Aider]*
288. **`/undo`** — Undo the last Git commit created by Aider. *[NATIVE; Aider]*
289. **`/voice`** — Record and transcribe voice input. *[NATIVE; Aider]*
290. **`/weak-model`** — Select the auxiliary/weak model for supporting tasks. *[NATIVE; Aider]*
291. **`/connect`** — Connect or add a model provider. *[NATIVE; OpenCode]*
292. **`/details`** — Toggle visibility of tool execution details. *[NATIVE; OpenCode]*
293. **`/themes`** — List or change interface themes. *[NATIVE; OpenCode]*
294. **`/thinking`** — Toggle visibility of reasoning blocks. *[NATIVE; OpenCode]*
295. **`/share`** — Create a shareable link for the current session. *[NATIVE; OpenCode]*
296. **`/unshare`** — Revoke or disable a session share link. *[NATIVE; OpenCode]*
297. **`/bug`** — File a bug report for the Gemini CLI project. *[NATIVE; Gemini CLI]*
298. **`/policies`** — Inspect applicable CLI policies. *[NATIVE; Gemini CLI]*
299. **`/restore`** — Restore a saved session/checkpoint. *[NATIVE; Gemini CLI]*
300. **`/rewind`** — Rewind the session to a prior checkpoint. *[NATIVE; Gemini CLI]*
301. **`/directory`** — Manage or inspect the active project directory context. *[NATIVE; Gemini CLI]*

### Reasoning, diagnosis & critical analysis (41)

302. **`/analyze`** — Analyze the provided material in a structured way. *[MACRO; 02-search-analysis]*
303. **`/deepdive`** — Perform a complete in-depth analysis of the topic. *[MACRO; 02-search-analysis]*
304. **`/breakdown`** — Break down a complex problem into its parts. *[MACRO; 02-search-analysis]*
305. **`/explain`** — Explain the concept clearly and progressively. *[MACRO; 02-search-analysis]*
306. **`/why`** — Focus on the causes and why behind a phenomenon. *[MACRO; 02-search-analysis]*
307. **`/how`** — Focus on how something works and on the process. *[MACRO; 02-search-analysis]*
308. **`/rootcause`** — Look for the root cause of a problem. *[MACRO; 02-search-analysis]*
309. **`/causes`** — List and analyze possible causes. *[MACRO; 02-search-analysis]*
310. **`/effects`** — Analyze effects and consequences. *[MACRO; 02-search-analysis]*
311. **`/implications`** — Highlight practical or theoretical implications. *[MACRO; 02-search-analysis]*
312. **`/assumptions`** — Make hidden or implicit assumptions explicit. *[MACRO; 02-search-analysis]*
313. **`/constraints`** — Identify technical, logical, or operational constraints. *[MACRO; 02-search-analysis]*
314. **`/edgecases`** — Look for edge cases and exceptional situations. *[MACRO; 02-search-analysis]*
315. **`/failuremodes`** — Identify ways a system can fail. *[MACRO; 02-search-analysis]*
316. **`/risks`** — List and analyze the main risks. *[MACRO; 02-search-analysis]*
317. **`/tradeoffs`** — Analyze trade-offs between competing objectives. *[MACRO; 02-search-analysis]*
318. **`/proscons`** — List advantages and disadvantages. *[MACRO; 02-search-analysis]*
319. **`/swot`** — Produce a SWOT analysis: strengths, weaknesses, opportunities, threats. *[MACRO; 02-search-analysis]*
320. **`/pestel`** — Produce a PESTEL analysis. *[MACRO; 02-search-analysis]*
321. **`/fivewhys`** — Apply the Five Whys technique. *[MACRO; 02-search-analysis]*
322. **`/firstprinciples`** — Reason from first principles. *[MACRO; 02-search-analysis]*
323. **`/secondorder`** — Consider indirect and second-order effects. *[MACRO; 02-search-analysis]*
324. **`/scenario`** — Build a plausible scenario and evaluate its consequences. *[MACRO; 02-search-analysis]*
325. **`/scenarios`** — Compare multiple alternative scenarios. *[MACRO; 02-search-analysis]*
326. **`/bestcase`** — Analyze the favorable scenario. *[MACRO; 02-search-analysis]*
327. **`/worstcase`** — Analyze the unfavorable scenario. *[MACRO; 02-search-analysis]*
328. **`/mostlikely`** — Describe the most plausible scenario without presenting it as certain. *[MACRO; 02-search-analysis]*
329. **`/sensitivity`** — Analyze how much the result changes when assumptions vary. *[MACRO; 02-search-analysis]*
330. **`/uncertainty`** — Highlight uncertainties, gaps, and unverified points. *[MACRO; 02-search-analysis]*
331. **`/confidence`** — Indicate the degree of confidence and what limits it. *[MACRO; 02-search-analysis]*
332. **`/counterargument`** — Build the main objections to a thesis. *[MACRO; 02-search-analysis]*
333. **`/devilsadvocate`** — Deliberately look for weaknesses and counterarguments. *[MACRO; 02-search-analysis]*
334. **`/steelman`** — Rebuild the strongest version of a position. *[MACRO; 02-search-analysis]*
335. **`/logiccheck`** — Check logical consistency and gaps in reasoning. *[MACRO; 02-search-analysis]*
336. **`/consistency`** — Look for internal contradictions or inconsistencies. *[MACRO; 02-search-analysis]*
337. **`/gap-analysis`** — Identify what is missing from the objective. *[MACRO; 02-search-analysis]*
338. **`/priority`** — Sort tasks or problems by reasoned priority. *[MACRO; 02-search-analysis]*
339. **`/decisiontree`** — Organize the problem as a decision tree. *[MACRO; 02-search-analysis]*
340. **`/framework`** — Build a reusable conceptual framework. *[MACRO; 02-search-analysis]*
341. **`/critic`** — Critically analyze content and identify weaknesses, defects, and areas for improvement. *[MACRO; 02-search-analysis]*
342. **`/brainstorm`** — Quickly generate ideas, alternatives, and creative directions. *[MACRO; 02-search-analysis]*

### Research, discovery & source verification (30)

343. **`/web`** — Search the web for updated information. *[MACRO; 02-search-analysis]*
344. **`/searchweb`** — Performs a targeted web search on the topic. *[MACRO; 02-search-analysis]*
345. **`/latest`** — Find the latest information available. *[MACRO; 02-search-analysis]*
346. **`/today`** — Limit your attention to today or current information. *[MACRO; 02-search-analysis]*
347. **`/thisweek`** — Look for developments from the last week. *[MACRO; 02-search-analysis]*
348. **`/thismonth`** — Look for developments from the last month. *[MACRO; 02-search-analysis]*
349. **`/sources`** — Provides the main supporting sources. *[MACRO; 02-search-analysis]*
350. **`/citations`** — Adds precise citations next to claims. *[MACRO; 02-search-analysis]*
351. **`/primarysources`** — Give priority to primary sources and original documents. *[MACRO; 02-search-analysis]*
352. **`/officialsources`** — Give priority to official sites and documentation. *[MACRO; 02-search-analysis]*
353. **`/academic`** — Favor academic or peer-reviewed sources. *[MACRO; 02-search-analysis]*
354. **`/papers`** — Search for scientific articles, preprints, or technical papers. *[MACRO; 02-search-analysis]*
355. **`/patents`** — Search for relevant patents. *[MACRO; 02-search-analysis]*
356. **`/standards`** — Search official standards and specifications. *[MACRO; 02-search-analysis]*
357. **`/manuals`** — Search manuals, datasheets, and technical documentation. *[MACRO; 02-search-analysis]*
358. **`/datasheet`** — Search for a component/product datasheet. *[MACRO; 02-search-analysis]*
359. **`/reviews`** — Search for reviews and usage ratings. *[MACRO; 02-search-analysis]*
360. **`/reddit`** — Search for Reddit community experiences and discussions. *[MACRO; 02-search-analysis]*
361. **`/forums`** — Search forums for technical discussions. *[MACRO; 02-search-analysis]*
362. **`/factcheck`** — Check a claim against reliable sources. *[MACRO; 02-search-analysis]*
363. **`/verify`** — Check whether a piece of data or a statement is correct. *[MACRO; 02-search-analysis]*
364. **`/crosscheck`** — Compare multiple independent sources. *[MACRO; 02-search-analysis]*
365. **`/debunk`** — Critically analyze a thesis and check for errors. *[MACRO; 02-search-analysis]*
366. **`/timeline`** — Reconstruct a chronology using verifiable sources. *[MACRO; 02-search-analysis]*
367. **`/archive`** — Search for archived or historical versions when available. *[MACRO; 02-search-analysis]*
368. **`/link`** — Provide the most useful direct link to the resource. *[MACRO; 02-search-analysis]*
369. **`/download`** — Find the official page or the requested downloadable file. *[MACRO; 02-search-analysis]*
370. **`/compare-sources`** — Compare what multiple sources say about the same point. *[MACRO; 02-search-analysis]*
371. **`/source-quality`** — Evaluate the reliability, authority, freshness, and limitations of sources. *[MACRO; 02-search-analysis]*
372. **`/research`** — Perform in-depth research, organizing sources, findings, and conclusions. *[MACRO; 02-search-analysis]*

### Science, mathematics & data analysis (51)

373. **`/calculate`** — Perform a calculation. *[MACRO; 04-science-data]*
374. **`/formula`** — Derive or apply a formula. *[MACRO; 04-science-data]*
375. **`/derive`** — Show the mathematical derivation. *[MACRO; 04-science-data]*
376. **`/proof`** — Construct or explain a proof. *[MACRO; 04-science-data]*
377. **`/solve`** — Solve the given problem. *[MACRO; 04-science-data]*
378. **`/equation`** — Solve or manipulate an equation. *[MACRO; 04-science-data]*
379. **`/system`** — Solve a system of equations. *[MACRO; 04-science-data]*
380. **`/algebra`** — Apply algebra tools. *[MACRO; 04-science-data]*
381. **`/geometry`** — Apply geometry tools. *[MACRO; 04-science-data]*
382. **`/trigonometry`** — Apply trigonometry. *[MACRO; 04-science-data]*
383. **`/calculus`** — Apply differential and integral calculus. *[MACRO; 04-science-data]*
384. **`/statistics`** — Perform statistical analysis. *[MACRO; 04-science-data]*
385. **`/probability`** — Perform probability calculations. *[MACRO; 04-science-data]*
386. **`/units`** — Convert units of measurement. *[MACRO; 04-science-data]*
387. **`/dimensions`** — Check dimensional consistency. *[MACRO; 04-science-data]*
388. **`/significantfigures`** — Handle significant figures and rounding. *[MACRO; 04-science-data]*
389. **`/estimate`** — Produce an educated estimate. *[MACRO; 04-science-data]*
390. **`/fermi`** — Perform a Fermi estimate. *[MACRO; 04-science-data]*
391. **`/physics`** — Analyze the problem using physics models. *[MACRO; 04-science-data]*
392. **`/chemistry`** — Analyze the problem using chemistry concepts. *[MACRO; 04-science-data]*
393. **`/biology`** — Analyze the problem using biology concepts. *[MACRO; 04-science-data]*
394. **`/astronomy`** — Analyze the problem using astronomical concepts. *[MACRO; 04-science-data]*
395. **`/electronics-math`** — Electrical/electronic calculations: Ohm's law, power, dividers, filters, etc. *[MACRO; 04-science-data]*
396. **`/tolerance`** — Calculate ranges considering tolerances. *[MACRO; 04-science-data]*
397. **`/errorpropagation`** — Estimate propagation of error or uncertainty. *[MACRO; 04-science-data]*
398. **`/data`** — Analyze a dataset. *[MACRO; 04-science-data]*
399. **`/datatable`** — Organize data in a table. *[MACRO; 04-science-data]*
400. **`/clean-data`** — Clean and normalize data. *[MACRO; 04-science-data]*
401. **`/missing`** — Identify missing data. *[MACRO; 04-science-data]*
402. **`/outliers`** — Identify outliers. *[MACRO; 04-science-data]*
403. **`/duplicates`** — Identify duplicate rows or values. *[MACRO; 04-science-data]*
404. **`/pivot`** — Create a pivot-table view. *[MACRO; 04-science-data]*
405. **`/groupby`** — Group data by one or more keys. *[MACRO; 04-science-data]*
406. **`/aggregate`** — Calculate aggregations such as sum, average, minimum, and maximum. *[MACRO; 04-science-data]*
407. **`/descriptive`** — Calculate descriptive statistics. *[MACRO; 04-science-data]*
408. **`/correlation`** — Analyze correlations. *[MACRO; 04-science-data]*
409. **`/regression`** — Set up or interpret a regression. *[MACRO; 04-science-data]*
410. **`/trend`** — Analyze the trend over time. *[MACRO; 04-science-data]*
411. **`/forecast`** — Build a forecast with explicit assumptions. *[MACRO; 04-science-data]*
412. **`/distribution`** — Analyze the distribution of values. *[MACRO; 04-science-data]*
413. **`/histogram`** — Create or describe a histogram. *[MACRO; 04-science-data]*
414. **`/chart`** — Create or suggest a suitable chart. *[MACRO; 04-science-data]*
415. **`/linechart`** — Use a line chart. *[MACRO; 04-science-data]*
416. **`/barchart`** — Use a bar chart. *[MACRO; 04-science-data]*
417. **`/scatter`** — Use a scatter plot. *[MACRO; 04-science-data]*
418. **`/piechart`** — Use a pie chart when appropriate. *[MACRO; 04-science-data]*
419. **`/heatmap`** — Create or describe a heatmap. *[MACRO; 04-science-data]*
420. **`/dashboard`** — Design a dashboard of indicators. *[MACRO; 04-science-data]*
421. **`/kpi`** — Define or analyze KPIs. *[MACRO; 04-science-data]*
422. **`/normalize-data`** — Bring data to a consistent scale or format. *[MACRO; 04-science-data]*
423. **`/exportcsv`** — Prepare data for CSV export. *[MACRO; 04-science-data]*

### Software, coding & technical engineering (159)

424. **`/code`** — Write code for the requested task. *[MACRO; 05-code-systems-github]*
425. **`/explaincode`** — Explain what the code does. *[MACRO; 05-code-systems-github]*
426. **`/debug`** — Find and fix bugs. *[MACRO; 05-code-systems-github]*
427. **`/reviewcode`** — Perform code review. *[MACRO; 05-code-systems-github]*
428. **`/refactor`** — Refactor while preserving behavior. *[MACRO; 05-code-systems-github]*
429. **`/optimize`** — Optimize performance or clarity of code. *[MACRO; 05-code-systems-github]*
430. **`/simplifycode`** — Simplify the code. *[MACRO; 05-code-systems-github]*
431. **`/fix`** — Propose a concrete fix to the problem. *[MACRO; 05-code-systems-github]*
432. **`/test`** — Write or propose tests. *[MACRO; 05-code-systems-github]*
433. **`/unittest`** — Write unit tests. *[MACRO; 05-code-systems-github]*
434. **`/integrationtest`** — Write integration tests. *[MACRO; 05-code-systems-github]*
435. **`/edgecasetest`** — Add tests for edge cases. *[MACRO; 05-code-systems-github]*
436. **`/benchmarkcode`** — Prepare a performance benchmark. *[MACRO; 05-code-systems-github]*
437. **`/profile`** — Analyze possible code bottlenecks. *[MACRO; 05-code-systems-github]*
438. **`/complexity`** — Analyze time and space complexity. *[MACRO; 05-code-systems-github]*
439. **`/securityreview`** — Look for defensive security issues in code. *[MACRO; 05-code-systems-github]*
440. **`/lint`** — Check style and typical problems like a linter would. *[MACRO; 05-code-systems-github]*
441. **`/types`** — Improve or add typing. *[MACRO; 05-code-systems-github]*
442. **`/docs`** — Write code documentation. *[MACRO; 05-code-systems-github]*
443. **`/docstring`** — Write docstrings. *[MACRO; 05-code-systems-github]*
444. **`/comments`** — Add helpful comments to the code. *[MACRO; 05-code-systems-github]*
445. **`/api`** — Design or document an API. *[MACRO; 05-code-systems-github]*
446. **`/rest`** — Design REST endpoints. *[MACRO; 05-code-systems-github]*
447. **`/graphql`** — Work on GraphQL schemas or queries. *[MACRO; 05-code-systems-github]*
448. **`/sql`** — Write or analyze SQL. *[MACRO; 05-code-systems-github]*
449. **`/regex`** — Write or explain regular expressions. *[MACRO; 05-code-systems-github]*
450. **`/python`** — Use Python. *[MACRO; 05-code-systems-github]*
451. **`/javascript`** — Use JavaScript. *[MACRO; 05-code-systems-github]*
452. **`/typescript`** — Use TypeScript. *[MACRO; 05-code-systems-github]*
453. **`/html`** — Use HTML. *[MACRO; 05-code-systems-github]*
454. **`/css`** — Use CSS. *[MACRO; 05-code-systems-github]*
455. **`/bash`** — Use Bash shell. *[MACRO; 05-code-systems-github]*
456. **`/powershell`** — Use PowerShell. *[MACRO; 05-code-systems-github]*
457. **`/c`** — Use C. *[MACRO; 05-code-systems-github]*
458. **`/cpp`** — Use C++. *[MACRO; 05-code-systems-github]*
459. **`/csharp`** — Use C#. *[MACRO; 05-code-systems-github]*
460. **`/java`** — Use Java. *[MACRO; 05-code-systems-github]*
461. **`/rust`** — Use Rust. *[MACRO; 05-code-systems-github]*
462. **`/go`** — Use Go. *[MACRO; 05-code-systems-github]*
463. **`/php`** — Use PHP. *[MACRO; 05-code-systems-github]*
464. **`/swift`** — Use Swift. *[MACRO; 05-code-systems-github]*
465. **`/kotlin`** — Use Kotlin. *[MACRO; 05-code-systems-github]*
466. **`/docker`** — Write or analyze Dockerfiles and Docker configurations. *[MACRO; 05-code-systems-github]*
467. **`/compose`** — Write or analyze Docker Compose files. *[MACRO; 05-code-systems-github]*
468. **`/kubernetes`** — Write or analyze Kubernetes manifests. *[MACRO; 05-code-systems-github]*
469. **`/nginx`** — Write or analyze Nginx configurations. *[MACRO; 05-code-systems-github]*
470. **`/config`** — Generate or check configuration files. *[MACRO; 05-code-systems-github]*
471. **`/pseudocode`** — Express the solution in pseudocode. *[MACRO; 05-code-systems-github]*
472. **`/algorithm`** — Design an algorithm and explain its logic. *[MACRO; 05-code-systems-github]*
473. **`/git`** — Use Git for the requested task. *[MACRO; 05-code-systems-github]*
474. **`/github`** — Work on the indicated GitHub repository. *[MACRO; 05-code-systems-github]*
475. **`/status`** — Interpret or query the repository state. *[MACRO; 05-code-systems-github]*
476. **`/diff`** — Show or analyze differences between versions. *[MACRO; 05-code-systems-github]*
477. **`/commit`** — Prepare a commit with an appropriate message. *[MACRO; 05-code-systems-github]*
478. **`/commitmsg`** — Write a commit message. *[MACRO; 05-code-systems-github]*
479. **`/branch`** — Create or manage a branch. *[MACRO; 05-code-systems-github]*
480. **`/merge`** — Plan or analyze a merge. *[MACRO; 05-code-systems-github]*
481. **`/rebase`** — Explain or prepare a rebase. *[MACRO; 05-code-systems-github]*
482. **`/cherrypick`** — Explain or prepare a cherry-pick. *[MACRO; 05-code-systems-github]*
483. **`/tag`** — Create or manage tags or versions. *[MACRO; 05-code-systems-github]*
484. **`/release`** — Prepare notes and content for a release. *[MACRO; 05-code-systems-github]*
485. **`/pullrequest`** — Prepare or analyze a pull request. *[MACRO; 05-code-systems-github]*
486. **`/issue`** — Write or analyze an issue. *[MACRO; 05-code-systems-github]*
487. **`/readme`** — Write or improve README.md. *[MACRO; 05-code-systems-github]*
488. **`/changelog`** — Generate or update a changelog. *[MACRO; 05-code-systems-github]*
489. **`/gitignore`** — Generate or check .gitignore. *[MACRO; 05-code-systems-github]*
490. **`/license`** — Explain or provide information about a software license. *[MACRO; 05-code-systems-github]*
491. **`/repoaudit`** — Analyze the structure and quality of a repository. *[MACRO; 05-code-systems-github]*
492. **`/history`** — Analyze Git history. *[MACRO; 05-code-systems-github]*
493. **`/blame`** — Help interpret git blame and the origin of changes. *[MACRO; 05-code-systems-github]*
494. **`/bisect`** — Set up a search for the commit that introduced a bug. *[MACRO; 05-code-systems-github]*
495. **`/submodule`** — Manage or explain Git submodules. *[MACRO; 05-code-systems-github]*
496. **`/ci`** — Design or debug a CI pipeline. *[MACRO; 05-code-systems-github]*
497. **`/maker`** — Tackle the problem with a practical maker approach. *[MACRO; 09-maker-laser-cnc-3d]*
498. **`/electronics`** — Analyze or design an electronic circuit. *[MACRO; 09-maker-laser-cnc-3d]*
499. **`/schematic`** — Describe or prepare an electrical/electronic diagram. *[MACRO; 09-maker-laser-cnc-3d]*
500. **`/wiring`** — Describe connections and wiring. *[MACRO; 09-maker-laser-cnc-3d]*
501. **`/pinout`** — Search or organize pinouts and connector pin assignments. *[MACRO; 09-maker-laser-cnc-3d]*
502. **`/components`** — Identify required components. *[MACRO; 09-maker-laser-cnc-3d]*
503. **`/partnumber`** — Search or interpret component codes. *[MACRO; 09-maker-laser-cnc-3d]*
504. **`/replacement`** — Search for a compatible spare part or replacement. *[MACRO; 09-maker-laser-cnc-3d]*
505. **`/equivalent`** — Search for equivalent components. *[MACRO; 09-maker-laser-cnc-3d]*
506. **`/pcb`** — Analyze or plan a PCB. *[MACRO; 09-maker-laser-cnc-3d]*
507. **`/breadboard`** — Propose breadboard prototyping. *[MACRO; 09-maker-laser-cnc-3d]*
508. **`/microcontroller`** — Design a microcontroller-based solution. *[MACRO; 09-maker-laser-cnc-3d]*
509. **`/arduino`** — Use the Arduino platform. *[MACRO; 09-maker-laser-cnc-3d]*
510. **`/esp32`** — Use ESP32. *[MACRO; 09-maker-laser-cnc-3d]*
511. **`/raspberrypi`** — Use Raspberry Pi. *[MACRO; 09-maker-laser-cnc-3d]*
512. **`/sensor`** — Select or integrate sensors. *[MACRO; 09-maker-laser-cnc-3d]*
513. **`/motor`** — Analyze motors, driving, and control. *[MACRO; 09-maker-laser-cnc-3d]*
514. **`/stepper`** — Analyze stepper motors and drivers. *[MACRO; 09-maker-laser-cnc-3d]*
515. **`/servo`** — Analyze servo motors and control. *[MACRO; 09-maker-laser-cnc-3d]*
516. **`/power`** — Analyze power, wattage, and sizing. *[MACRO; 09-maker-laser-cnc-3d]*
517. **`/battery`** — Analyze batteries, autonomy, and energy management. *[MACRO; 09-maker-laser-cnc-3d]*
518. **`/connector`** — Search or select suitable connectors. *[MACRO; 09-maker-laser-cnc-3d]*
519. **`/mechanical`** — Analyze mechanical and assembly aspects. *[MACRO; 09-maker-laser-cnc-3d]*
520. **`/cad`** — Plan CAD geometry or workflow. *[MACRO; 09-maker-laser-cnc-3d]*
521. **`/dimensions-tech`** — Define technical dimensions and sizes. *[MACRO; 09-maker-laser-cnc-3d]*
522. **`/tolerances`** — Define dimensional tolerances. *[MACRO; 09-maker-laser-cnc-3d]*
523. **`/fit`** — Analyze fits, clearances, and interferences. *[MACRO; 09-maker-laser-cnc-3d]*
524. **`/fasteners`** — Select screws, nuts, inserts, or fasteners. *[MACRO; 09-maker-laser-cnc-3d]*
525. **`/materials`** — Compare materials by properties and workability. *[MACRO; 09-maker-laser-cnc-3d]*
526. **`/prototype`** — Plan a prototype. *[MACRO; 09-maker-laser-cnc-3d]*
527. **`/approve`** — Retry one action denied by automatic review. *[NATIVE — OPENAI; 10-v1.2-additions]*
528. **`/cloud`** — Run the chat in the cloud when available. *[NATIVE — CHATGPT; 10-v1.2-additions]*
529. **`/cloud-environment`** — Choose the cloud environment for the chat. *[NATIVE — CHATGPT; 10-v1.2-additions]*
530. **`/compact`** — Compact or summarize chat context to free context space. *[NATIVE — OPENAI; 10-v1.2-additions]*
531. **`/fast`** — Toggle the Fast service tier when available. *[NATIVE — OPENAI; 10-v1.2-additions]*
532. **`/feedback`** — Open feedback/reporting with optional logs. *[NATIVE — OPENAI; 10-v1.2-additions]*
533. **`/fork`** — Fork the current chat into a new chat or worktree. *[NATIVE — OPENAI; 10-v1.2-additions]*
534. **`/goal`** — Set or manage a persistent task goal. *[NATIVE — OPENAI; 10-v1.2-additions]*
535. **`/ide-context`** — Toggle shared IDE context. *[NATIVE — CHATGPT; 10-v1.2-additions]*
536. **`/init`** — Generate an `AGENTS.md` scaffold for the current project. *[NATIVE — OPENAI; 10-v1.2-additions]*
537. **`/local`** — Run the chat in the selected local project. *[NATIVE — CHATGPT; 10-v1.2-additions]*
538. **`/mcp`** — View configured MCP servers/tools and status. *[NATIVE — OPENAI; 10-v1.2-additions]*
539. **`/memories`** — Configure memory use or memory generation. *[NATIVE — OPENAI; 10-v1.2-additions]*
540. **`/model`** — Choose the active model. *[NATIVE — OPENAI; 10-v1.2-additions]*
541. **`/pet`** — Show, choose or hide the desktop/terminal pet. *[NATIVE — OPENAI; 10-v1.2-additions]*
542. **`/personality`** — Choose the response personality/style when supported. *[NATIVE — OPENAI; 10-v1.2-additions]*
543. **`/project`** — Choose a project for new chats. *[NATIVE — CHATGPT; 10-v1.2-additions]*
544. **`/reasoning`** — Choose reasoning effort for the current chat. *[NATIVE — CHATGPT; 10-v1.2-additions]*
545. **`/review`** — Start code review / working-tree review mode. *[NATIVE — OPENAI; 10-v1.2-additions]*
546. **`/side`** — Start a temporary side chat. *[NATIVE — OPENAI; 10-v1.2-additions]*
547. **`/task`** — Start a chat without a project. *[NATIVE — CHATGPT; 10-v1.2-additions]*
548. **`/worktree`** — Run the chat in a new Git worktree. *[NATIVE — CHATGPT; 10-v1.2-additions]*
549. **`/ide`** — Include current IDE files, selection and context. *[NATIVE — CODEX; 10-v1.2-additions]*
550. **`/keymap`** — Inspect or remap TUI keyboard shortcuts. *[NATIVE — CODEX; 10-v1.2-additions]*
551. **`/vim`** — Toggle Vim editing mode in the composer. *[NATIVE — CODEX; 10-v1.2-additions]*
552. **`/setup-default-sandbox`** — Configure the elevated Windows sandbox. *[NATIVE — CODEX; 10-v1.2-additions]*
553. **`/sandbox-add-read-dir`** — Grant sandbox read access to an extra Windows directory. *[NATIVE — CODEX; 10-v1.2-additions]*
554. **`/agent`** — Switch to or inspect an agent thread. *[NATIVE — CODEX; 10-v1.2-additions]*
555. **`/subagents`** — Browse or switch subagent threads. *[NATIVE — CODEX; 10-v1.2-additions]*
556. **`/apps`** — Browse apps/connectors and insert one into the prompt. *[NATIVE — CODEX; 10-v1.2-additions]*
557. **`/plugins`** — Browse or manage installed/discoverable plugins. *[NATIVE — CODEX; 10-v1.2-additions]*
558. **`/hooks`** — View and manage lifecycle hooks. *[NATIVE — CODEX; 10-v1.2-additions]*
559. **`/clear`** — Clear the terminal and start a fresh chat. *[NATIVE — CODEX; 10-v1.2-additions]*
560. **`/rename`** — Rename the current chat. *[NATIVE — CODEX; 10-v1.2-additions]*
561. **`/delete`** — Permanently delete the current session and exit. *[NATIVE — CODEX; 10-v1.2-additions]*
562. **`/copy`** — Copy the latest completed Codex output. *[NATIVE — CODEX; 10-v1.2-additions]*
563. **`/exit`** — Exit the CLI. *[NATIVE — CODEX; 10-v1.2-additions]*
564. **`/quit`** — Exit the CLI; alias of `/exit`. *[NATIVE — CODEX; 10-v1.2-additions — alias/equivalent: /exit]*
565. **`/experimental`** — Toggle experimental Codex features. *[NATIVE — CODEX; 10-v1.2-additions]*
566. **`/skills`** — Browse and apply available skills. *[NATIVE — CODEX; 10-v1.2-additions]*
567. **`/import`** — Import supported Claude Code or Cursor setup/chats. *[NATIVE — CODEX; 10-v1.2-additions]*
568. **`/logout`** — Sign out of Codex. *[NATIVE — CODEX; 10-v1.2-additions]*
569. **`/mention`** — Attach a file or folder to the chat. *[NATIVE — CODEX; 10-v1.2-additions]*
570. **`/ps`** — Show background terminals and recent output. *[NATIVE — CODEX; 10-v1.2-additions]*
571. **`/stop`** — Stop all background terminals for the session. *[NATIVE — CODEX; 10-v1.2-additions]*
572. **`/app`** — Continue the current session in the ChatGPT desktop app. *[NATIVE — CODEX; 10-v1.2-additions]*
573. **`/btw`** — Start an ephemeral side chat; alias of `/side`. *[NATIVE — CODEX; 10-v1.2-additions — alias/equivalent: /side]*
574. **`/raw`** — Toggle raw scrollback/output mode. *[NATIVE — CODEX; 10-v1.2-additions]*
575. **`/resume`** — Resume a saved chat/session. *[NATIVE — CODEX; 10-v1.2-additions]*
576. **`/new`** — Start a new chat in the same CLI session. *[NATIVE — CODEX; 10-v1.2-additions]*
577. **`/usage`** — View token usage or available reset actions. *[NATIVE — CODEX; 10-v1.2-additions]*
578. **`/debug-config`** — Show config-layer and policy diagnostics. *[NATIVE — CODEX; 10-v1.2-additions]*
579. **`/statusline`** — Configure interactive TUI status-line fields. *[NATIVE — CODEX; 10-v1.2-additions]*
580. **`/title`** — Configure terminal/tab title fields. *[NATIVE — CODEX; 10-v1.2-additions]*
581. **`/theme`** — Choose the syntax-highlighting theme. *[NATIVE — CODEX; 10-v1.2-additions]*
582. **`/pets`** — Choose or hide a terminal pet. *[NATIVE — CODEX; 10-v1.2-additions]*

### Translation, language & localization (20)

583. **`/translate`** — Translate into the requested language. *[MACRO; 03-writing-languages-communication]*
584. **`/it`** — Answer or translate into Italian. *[MACRO; 03-writing-languages-communication]*
585. **`/fr`** — Reply or translate into French. *[MACRO; 03-writing-languages-communication]*
586. **`/en`** — Answer or translate into English. *[MACRO; 03-writing-languages-communication]*
587. **`/de`** — Answer or translate into German. *[MACRO; 03-writing-languages-communication]*
588. **`/es`** — Answer or translate into Spanish. *[MACRO; 03-writing-languages-communication]*
589. **`/pt`** — Answer or translate into Portuguese. *[MACRO; 03-writing-languages-communication]*
590. **`/bilingual`** — Output text in two languages. *[MACRO; 03-writing-languages-communication]*
591. **`/trilingual`** — Output text in three languages. *[MACRO; 03-writing-languages-communication]*
592. **`/literal`** — Translate as literally as possible. *[MACRO; 03-writing-languages-communication]*
593. **`/natural`** — Translate while favoring naturalness in the target language. *[MACRO; 03-writing-languages-communication]*
594. **`/localized`** — Adapt expressions, units and references to local context. *[MACRO; 03-writing-languages-communication]*
595. **`/formal-fr`** — Formal and administrative French. *[MACRO; 03-writing-languages-communication]*
596. **`/casual-fr`** — Colloquial and natural French. *[MACRO; 03-writing-languages-communication]*
597. **`/formal-it`** — Formal Italian. *[MACRO; 03-writing-languages-communication]*
598. **`/casual-it`** — Colloquial Italian. *[MACRO; 03-writing-languages-communication]*
599. **`/terminology`** — Maintain consistent technical terminology. *[MACRO; 03-writing-languages-communication]*
600. **`/glossary-translate`** — Translate according to an established glossary. *[MACRO; 03-writing-languages-communication]*
601. **`/paralleltext`** — Show original and translation side by side or in sequence. *[MACRO; 03-writing-languages-communication]*
602. **`/backtranslate`** — Translate back into the original language to check fidelity. *[MACRO; 03-writing-languages-communication]*

### Visual design, image generation & photography (350)

603. **`/4k`** — High-quality and detailed 4K image. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
604. **`/8k`** — High resolution, ultra-detailed image. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
605. **`/hdreal`** — Advanced HD photorealistic look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
606. **`/ultrarealistic`** — Extremely realistic visual output. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
607. **`/cinematic`** — Cinematic lighting, composition and mood. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
608. **`/photorealistic`** — Realistic photo look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
609. **`/hyperrealistic`** — Very high realism and rich in micro-details. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
610. **`/highdetail`** — Increases emphasis on visual details. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
611. **`/sharp`** — Sharp appearance with well-defined details. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
612. **`/naturalphoto`** — Natural photographic look, not very artificial. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
613. **`/droneview`** — Aerial perspective drone style. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
614. **`/aerialview`** — High altitude view from above. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
615. **`/topdown`** — Shot directly from top to bottom. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
616. **`/lowangle`** — Shot from below towards the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
617. **`/highangle`** — Camera looking down at the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
618. **`/sideview`** — Side profile perspective. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
619. **`/closeup`** — Close-up shot of the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
620. **`/extremecloseup`** — Extreme close-up, highly detailed. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
621. **`/wideangle`** — Wide field of view showing more of the environment. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
622. **`/fisheye`** — Distorted ultra-wide angle fisheye perspective. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
623. **`/pov`** — First person/subjective shot. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
624. **`/overtheshoulder`** — Perspective from behind the subject's shoulder. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
625. **`/birdseyeview`** — Scene seen directly from above. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
626. **`/wormseyeview`** — Extreme perspective from bottom to top. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
627. **`/frontview`** — Front view of the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
628. **`/rearview`** — Rear view of the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
629. **`/threequarter`** — Three-quarter view, intermediate between front and profile. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
630. **`/eyelevel`** — Camera at eye level. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
631. **`/groundlevel`** — Camera very close to ground level. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
632. **`/dutchangle`** — Tilted shot for tension or dynamism. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
633. **`/centered`** — Subject centered in the composition. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
634. **`/fullbody`** — Full body shot. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
635. **`/mediumshot`** — Medium shot of the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
636. **`/mediumcloseup`** — Medium close-up. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
637. **`/longshot`** — Wide shot with small subject in the environment. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
638. **`/establishingshot`** — Opening shot showing the context. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
639. **`/anamorphic`** — Widescreen cinema lens look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
640. **`/bokeh`** — Blurred background with out-of-focus lights. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
641. **`/shallowdepth`** — Sharp subject with shallow depth of field. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
642. **`/deepfocus`** — Both foreground and background are sharp. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
643. **`/macro`** — Macro shooting of small subjects or details. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
644. **`/telephoto`** — Telephoto look with perspective compression. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
645. **`/ultrawide`** — Ultra-wide angle look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
646. **`/24mm`** — Simulates a 24mm wide-angle lens. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
647. **`/35mm`** — Simulates a 35mm, natural/documentary lens. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
648. **`/50mm`** — Simulates a standard 50mm lens. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
649. **`/85mm`** — Simulates an 85mm short portrait telephoto lens. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
650. **`/135mm`** — Simulates a 135mm tele with strong compression. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
651. **`/f1.4`** — Very wide aperture, strongly blurred background. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
652. **`/f2.8`** — Wide aperture with good subject isolation. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
653. **`/f8`** — Wider depth of field and sharp look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
654. **`/motionblur`** — Dynamic motion blur. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
655. **`/longexposure`** — Long exposure photography effect. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
656. **`/freezeaction`** — Frozen and sharp movement. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
657. **`/filmgrain`** — Analog film grain. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
658. **`/35mmfilm`** — Classic photographic aesthetics on 35mm film. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
659. **`/polaroid`** — Polaroid instant photo aesthetics. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
660. **`/instantphoto`** — Instant camera look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
661. **`/disposablecamera`** — Raw disposable camera look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
662. **`/vintage`** — Aged classic visual aesthetic. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
663. **`/retro`** — Nostalgic retro style. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
664. **`/softlighting`** — Soft and diffused lighting. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
665. **`/dramaticlighting`** — Strong and contrasty cinematic lighting. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
666. **`/rimlight`** — Bright edge around the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
667. **`/backlight`** — Subject lit from behind. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
668. **`/volumetriclight`** — Beams of light visible in the atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
669. **`/godrays`** — Dramatic rays of sunlight or artificial light. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
670. **`/studio`** — Professional studio photography setup. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
671. **`/keylight`** — Main light that shapes the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
672. **`/filllight`** — Fill light to reduce shadows. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
673. **`/hardlight`** — Hard light with sharp shadows. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
674. **`/diffusedlight`** — Diffused light with soft transitions. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
675. **`/sidelight`** — Side light to emphasize volume and texture. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
676. **`/toplight`** — Light coming from above. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
677. **`/underlighting`** — Light from below, often theatrical or disturbing. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
678. **`/candlelight`** — Warm candle lighting. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
679. **`/firelight`** — Irregular and hot lighting from fire. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
680. **`/windowlight`** — Natural light coming from a window. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
681. **`/softbox`** — Photographic softbox look. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
682. **`/spotlight`** — Light beam concentrated on the subject. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
683. **`/lowkey`** — Dark, contrasty lighting with many shadows. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
684. **`/highkey`** — Clear, uniform, low-contrast illumination. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
685. **`/fog`** — Dense atmospheric fog around the scene. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
686. **`/mist`** — Foggy, soft and light atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
687. **`/rainynight`** — Rainy night environment. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
688. **`/rain`** — Visible rain and humidity. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
689. **`/storm`** — Stormy and dramatic weather. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
690. **`/snow`** — Snow and winter atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
691. **`/sunset`** — Warm sunset lighting. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
692. **`/sunrise`** — Soft lighting of dawn. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
693. **`/goldenhour`** — Warm light of the golden hour. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
694. **`/bluehour`** — Atmosphere of blue twilight. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
695. **`/moonlight`** — Moonlight illumination. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
696. **`/overcast`** — Overcast sky with soft, even light. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
697. **`/cloudy`** — Cloudy sky. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
698. **`/sunny`** — Full sunlight and bright atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
699. **`/dawn`** — Atmosphere of the first light of dawn. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
700. **`/dusk`** — Evening twilight atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
701. **`/night`** — Night scene. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
702. **`/smoke`** — Atmospheric smoke effects. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
703. **`/dust`** — Suspended dust and dry atmosphere. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
704. **`/haze`** — Haze that attenuates contrast and distance. *[IMAGE KEYWORD; 07-images-camera-light-atmosphere]*
705. **`/neonlights`** — Vibrant neon lighting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
706. **`/darkmoody`** — Dark and melancholic atmosphere. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
707. **`/warmtones`** — Warm color palette. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
708. **`/cooltones`** — Cool color palette. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
709. **`/pastel`** — Delicate pastel colors. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
710. **`/mutedcolors`** — Muted and undersaturated colors. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
711. **`/vibrant`** — Intense and saturated colors. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
712. **`/monochrome`** — Monochromatic palette. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
713. **`/blackandwhite`** — Black and white image. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
714. **`/sepia`** — Vintage sepia tone. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
715. **`/tealorange`** — Cinematic teal-and-orange color grading. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
716. **`/desaturated`** — Strongly desaturated colors. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
717. **`/highcontrast`** — High tonal contrast. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
718. **`/lowcontrast`** — Soft and low contrast. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
719. **`/dreamy`** — Soft and dreamlike look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
720. **`/ethereal`** — Light, luminous and ethereal appearance. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
721. **`/gritty`** — Rough, dirty and realistic look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
722. **`/cleanlook`** — Clean and tidy look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
723. **`/oldmoney`** — Elegant and timeless luxury aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
724. **`/luxury`** — High-end premium style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
725. **`/minimalist`** — Clean and simple composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
726. **`/editorial`** — Editorial magazine photography. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
727. **`/fashion`** — High-fashion photography style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
728. **`/streetstyle`** — Modern street-fashion aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
729. **`/magazinecover`** — Magazine-cover composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
730. **`/productphoto`** — Clean, commercial product photography. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
731. **`/advertising`** — Advertising photography look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
732. **`/catalog`** — Catalog-style product photo. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
733. **`/lifestyle`** — Natural and ambient lifestyle photography. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
734. **`/documentary`** — Documentary photography style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
735. **`/streetphoto`** — Candid street photography. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
736. **`/headshot`** — Professional head-and-shoulders portrait. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
737. **`/underwater`** — Underwater environment and perspective. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
738. **`/space`** — Space or cosmic environment. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
739. **`/desert`** — Desert landscape. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
740. **`/forest`** — Natural forest setting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
741. **`/mountains`** — Dramatic mountain landscape. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
742. **`/beach`** — Coastal or beach environment. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
743. **`/cityscape`** — View of the urban landscape. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
744. **`/nightcity`** — Night city environment. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
745. **`/interior`** — Interior scene. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
746. **`/exterior`** — Outdoor scene. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
747. **`/studiointerior`** — Interior designed as a photo set. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
748. **`/industrial`** — Industrial environment. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
749. **`/workshop`** — Workshop or maker laboratory. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
750. **`/laboratory`** — Scientific or technical laboratory. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
751. **`/countryside`** — Rural landscape/countryside. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
752. **`/snowyforest`** — Snowy forest. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
753. **`/ruins`** — Ruins or abandoned environment. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
754. **`/cyberpunk`** — Futuristic neon cyberpunk aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
755. **`/futuristic`** — Futuristic visual design. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
756. **`/postapocalyptic`** — Desolate and dystopian post-apocalyptic aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
757. **`/fantasy`** — Magical and imaginative fantasy world. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
758. **`/scifi`** — Science-fiction-inspired style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
759. **`/medieval`** — Aesthetics of the medieval era. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
760. **`/samurai`** — Samurai-inspired cinematic scene. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
761. **`/noir`** — Dark and contrasty film-noir style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
762. **`/detective`** — Mysterious and investigative atmosphere. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
763. **`/superhero`** — Epic superhero-inspired visual. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
764. **`/steampunk`** — Retrofuturist steampunk aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
765. **`/dieselpunk`** — Dieselpunk retrofuturist industrial aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
766. **`/solarpunk`** — Bright and natural sustainable future. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
767. **`/horror`** — Horror atmosphere. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
768. **`/gothic`** — Gothic aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
769. **`/western`** — Western aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
770. **`/historical`** — Historical visual reconstruction. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
771. **`/anime`** — Style inspired by Japanese anime. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
772. **`/comicbook`** — Illustrated comic aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
773. **`/oilpainting`** — Traditional oil painting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
774. **`/watercolor`** — Soft watercolor effect. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
775. **`/sketch`** — Hand-drawn sketch look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
776. **`/claystyle`** — Clay/claymation look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
777. **`/3drender`** — High-quality 3D rendered appearance. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
778. **`/isometric`** — Isometric three-dimensional perspective. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
779. **`/miniature`** — Miniature world or diorama effect. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
780. **`/tiltshift`** — Miniature tilt-shift photo effect. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
781. **`/papercraft`** — Handmade paper-cutout style. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
782. **`/charcoal`** — Charcoal drawing. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
783. **`/pencil`** — Pencil drawing. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
784. **`/graphite`** — Graphite drawing with visible strokes. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
785. **`/ink`** — Ink illustration. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
786. **`/lineart`** — Clean line drawing. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
787. **`/pasteldrawing`** — Pastel drawing. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
788. **`/gouache`** — Gouache painting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
789. **`/acrylic`** — Acrylic painting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
790. **`/digitalpainting`** — Digital painting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
791. **`/conceptart`** — Visual-production concept art. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
792. **`/mattepainting`** — Cinematic matte painting. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
793. **`/pixelart`** — Pixel-art aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
794. **`/lowpoly`** — Low-poly 3D rendering. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
795. **`/voxel`** — Voxel/cube rendering. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
796. **`/glassart`** — Artistic aesthetic in clear glass. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
797. **`/chrome`** — Chrome reflective metallic look. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
798. **`/holographic`** — Futuristic holographic material effect. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
799. **`/doubleexposure`** — Two images merged into a single composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
800. **`/silhouette`** — Dark subject against backlight. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
801. **`/reflection`** — Reflective surface or mirrored composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
802. **`/mirror`** — Composition based on mirrors and reflections. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
803. **`/fire`** — Fire and flame effects. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
804. **`/glitch`** — Digital glitch and distortion aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
805. **`/dreamcore`** — Surreal, dreamlike and slightly disturbing aesthetic. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
806. **`/metal`** — Emphasizes metallic surfaces and materials. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
807. **`/wood`** — Emphasizes wood grain and materials. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
808. **`/stone`** — Emphasizes stone texture. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
809. **`/fabric`** — Emphasizes fibers and textile textures. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
810. **`/transparent`** — Transparent materials or transparent background when supported. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
811. **`/iridescent`** — Shimmering iridescent reflections. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
812. **`/wetlook`** — Wet and reflective surfaces. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
813. **`/particles`** — Visible suspended particles. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
814. **`/sparks`** — Bright sparks. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
815. **`/lighttrails`** — Light trails from motion or long exposure. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
816. **`/ruleofthirds`** — Composition according to the rule of thirds. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
817. **`/symmetry`** — Symmetrical composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
818. **`/asymmetry`** — Intentionally asymmetrical composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
819. **`/leadinglines`** — Use leading lines to guide the eye. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
820. **`/negative-space`** — Leave large, intentional blank space. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
821. **`/foreground`** — Introduce strong elements in the foreground. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
822. **`/background`** — Pay particular attention to the background. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
823. **`/layered`** — Composition on multiple levels of depth. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
824. **`/balanced`** — Visually balance masses and subjects. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
825. **`/dynamic`** — Dynamic composition with diagonals and movement. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
826. **`/static`** — Stable and orderly composition. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
827. **`/minimalbackground`** — Simple and non-distracting background. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
828. **`/whitebackground`** — Clean white background. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
829. **`/darkbackground`** — Dark background. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
830. **`/isolated`** — Subject isolated from context. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
831. **`/cutout`** — Cutout look on a plain or transparent background. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
832. **`/poster`** — Poster-style graphic layout. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
833. **`/bookcover`** — Composition suitable for a book cover. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
834. **`/a5cover`** — Vertical composition designed for an A5 cover. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
835. **`/spacefortitle`** — Leave a clear space to insert a title. *[IMAGE KEYWORD; 08-images-styles-effects-composition]*
836. **`/handwritten`** — Present content as notebook-style handwritten notes. *[MACRO; 10-v1.2-additions]*
837. **`/visualize`** — Turn an idea into a visual explanation. *[MACRO; 10-v1.2-additions]*
838. **`/stickynotes`** — Break ideas into sticky-note-sized units. *[MACRO; 10-v1.2-additions]*
839. **`/infographic`** — Structure content as an infographic. *[MACRO; 10-v1.2-additions]*
840. **`/xray`** — Reveal internal structure or hidden parts. *[MACRO; 10-v1.2-additions]*
841. **`/blueprint`** — Present a technical blueprint-style explanation. *[MACRO; 10-v1.2-additions]*
842. **`/explodedview`** — Break an object/system into separated components. *[MACRO; 10-v1.2-additions]*
843. **`/thenvsnow`** — Compare past versus present. *[MACRO; 10-v1.2-additions]*
844. **`/beforeafter`** — Show a before/after transformation. *[MACRO; 10-v1.2-additions]*
845. **`/cutaway`** — Explain a subject using a cutaway view. *[MACRO; 10-v1.2-additions]*
846. **`/anatomy`** — Explain all major parts of a subject. *[MACRO; 10-v1.2-additions]*
847. **`/layers`** — Explain a system layer by layer. *[MACRO; 10-v1.2-additions]*
848. **`/ecosystem`** — Map connected actors/components in an ecosystem. *[MACRO; 10-v1.2-additions]*
849. **`/journey`** — Describe an end-to-end journey. *[MACRO; 10-v1.2-additions]*
850. **`/cycle`** — Explain a recurring cycle. *[MACRO; 10-v1.2-additions]*
851. **`/comparison`** — Create a side-by-side comparison. *[MACRO; 10-v1.2-additions]*
852. **`/scale`** — Compare sizes, levels or magnitude. *[MACRO; 10-v1.2-additions]*
853. **`/evolution`** — Show how something evolves over time. *[MACRO; 10-v1.2-additions]*
854. **`/future`** — Explore plausible future scenarios. *[MACRO; 10-v1.2-additions]*
855. **`/inside`** — Explain inner workings. *[MACRO; 10-v1.2-additions]*
856. **`/microscopic`** — Zoom into very small-scale detail. *[MACRO; 10-v1.2-additions]*
857. **`/macroscopic`** — Zoom out to system-level context. *[MACRO; 10-v1.2-additions]*
858. **`/crosssection`** — Explain a subject as a cross-section. *[MACRO; 10-v1.2-additions]*
859. **`/map`** — Create a geographic or conceptual map. *[MACRO; 10-v1.2-additions]*
860. **`/architecture`** — Design or explain system/software architecture. *[MACRO; 10-v1.2-additions]*
861. **`/wireframe`** — Produce a website/app wireframe concept. *[MACRO; 10-v1.2-additions]*
862. **`/mockup`** — Produce a realistic product/interface preview concept. *[MACRO; 10-v1.2-additions]*
863. **`/birdseye`** — Present the subject from a top-down bird’s-eye perspective. *[MACRO; 10-v1.2-additions]*
864. **`/360view`** — Describe or visualize the subject from all angles. *[MACRO; 10-v1.2-additions]*
865. **`/storyboard`** — Break a story into sequential visual scenes. *[MACRO; 10-v1.2-additions]*
866. **`/comic`** — Explain or present content as comic panels. *[MACRO; 10-v1.2-additions]*
867. **`/cover`** — Create a book/report cover concept. *[MACRO; 10-v1.2-additions]*
868. **`/adcreative`** — Generate an advertising creative concept. *[MACRO; 10-v1.2-additions]*
869. **`/thumbnail`** — Generate a thumbnail concept. *[MACRO; 10-v1.2-additions]*
870. **`/carousel`** — Create a social-media carousel structure. *[MACRO; 10-v1.2-additions]*
871. **`/socialvisual`** — Create a social-media graphic concept. *[MACRO; 10-v1.2-additions]*
872. **`/quotevisual`** — Turn a quote into a shareable visual concept. *[MACRO; 10-v1.2-additions]*
873. **`/viva`** — Prepare for a viva/oral examination. *[MACRO; 10-v1.2-additions]*
874. **`/mythvsfact`** — Separate myths from verified facts. *[MACRO; 10-v1.2-additions]*
875. **`/fiveforces`** — Apply Porter’s Five Forces analysis. *[MACRO; 10-v1.2-additions]*
876. **`/simulate`** — Run a structured simulation exercise. *[MACRO; 10-v1.2-additions]*
877. **`/roleplay`** — Assume a role and respond from that perspective. *[MACRO; 10-v1.2-additions]*
878. **`/consultant`** — Use a consulting-style structure and recommendations. *[MACRO; 10-v1.2-additions]*
879. **`/executivebrief`** — Produce an executive brief. *[MACRO; 10-v1.2-additions]*
880. **`/insights`** — Extract actionable insights. *[MACRO; 10-v1.2-additions]*
881. **`/recommendations`** — Produce concrete recommendations. *[MACRO; 10-v1.2-additions]*
882. **`/marketmap`** — Map an industry or market landscape. *[MACRO; 10-v1.2-additions]*
883. **`/businessmodel`** — Explain or design a business model. *[MACRO; 10-v1.2-additions]*
884. **`/pitch`** — Build an investor/startup pitch. *[MACRO; 10-v1.2-additions]*
885. **`/investor`** — Analyze from an investor perspective. *[MACRO; 10-v1.2-additions]*
886. **`/redteam`** — Stress-test a plan by actively looking for weaknesses. *[MACRO; 10-v1.2-additions]*
887. **`/premortem`** — Assume failure and analyze likely causes in advance. *[MACRO; 10-v1.2-additions]*
888. **`/reverseengineer`** — Deconstruct how an outcome/system works. *[MACRO; 10-v1.2-additions]*
889. **`/dashboardanalysis`** — Analyze a dashboard and its KPIs. *[MACRO; 10-v1.2-additions]*
890. **`/actionplan`** — Create a concrete step-by-step action plan. *[MACRO; 10-v1.2-additions]*
891. **`/viralreel`** — Create a high-retention short-form Reel concept. *[MACRO; 10-v1.2-additions]*
892. **`/viralshorts`** — Optimize content for YouTube Shorts. *[MACRO; 10-v1.2-additions]*
893. **`/viralhook`** — Generate a high-attention opening hook. *[MACRO; 10-v1.2-additions]*
894. **`/hook10`** — Generate 10 opening hooks. *[MACRO; 10-v1.2-additions]*
895. **`/hook50`** — Generate 50 opening hooks. *[MACRO; 10-v1.2-additions]*
896. **`/retentioncurve`** — Plan engagement across the full content length. *[MACRO; 10-v1.2-additions]*
897. **`/patterninterrupt`** — Add attention-reset moments to content. *[MACRO; 10-v1.2-additions]*
898. **`/openloop`** — Create curiosity loops that are resolved later. *[MACRO; 10-v1.2-additions]*
899. **`/curiosity`** — Increase curiosity and information tension. *[MACRO; 10-v1.2-additions]*
900. **`/psychology`** — Apply relevant psychological principles to the content. *[MACRO; 10-v1.2-additions]*
901. **`/surprise`** — Add an unexpected twist or reveal. *[MACRO; 10-v1.2-additions]*
902. **`/herojourney`** — Structure a story using the Hero’s Journey. *[MACRO; 10-v1.2-additions]*
903. **`/script30`** — Write a roughly 30-second script. *[MACRO; 10-v1.2-additions]*
904. **`/script60`** — Write a roughly 60-second script. *[MACRO; 10-v1.2-additions]*
905. **`/script90`** — Write a roughly 90-second script. *[MACRO; 10-v1.2-additions]*
906. **`/broll`** — Suggest B-roll shots. *[MACRO; 10-v1.2-additions]*
907. **`/shotlist`** — Build a shot list. *[MACRO; 10-v1.2-additions]*
908. **`/cameraangles`** — Suggest suitable camera angles. *[MACRO; 10-v1.2-additions]*
909. **`/cinematicsketch`** — Create a cinematic-sketch prompt/concept. *[MACRO; 10-v1.2-additions]*
910. **`/storyboardpro`** — Create a detailed production storyboard. *[MACRO; 10-v1.2-additions]*
911. **`/sceneplan`** — Plan content scene by scene. *[MACRO; 10-v1.2-additions]*
912. **`/transitions`** — Suggest editing transitions. *[MACRO; 10-v1.2-additions]*
913. **`/motiongraphics`** — Suggest motion-graphics concepts. *[MACRO; 10-v1.2-additions]*
914. **`/vox`** — Use a Vox-style explanatory documentary structure. *[MACRO; 10-v1.2-additions]*
915. **`/johnnyharris`** — Use a map-driven investigative explainer structure inspired by Johnny Harris. *[MACRO; 10-v1.2-additions]*
916. **`/magnatesmedia`** — Use a dramatic business-documentary structure inspired by MagnatesMedia. *[MACRO; 10-v1.2-additions]*
917. **`/kurzgesagt`** — Use a concise animated-explainer structure inspired by Kurzgesagt. *[MACRO; 10-v1.2-additions]*
918. **`/netflix`** — Use a polished streaming-documentary tone. *[MACRO; 10-v1.2-additions]*
919. **`/bbc`** — Use a sober public-broadcast documentary tone. *[MACRO; 10-v1.2-additions]*
920. **`/natgeo`** — Use a nature/documentary presentation style. *[MACRO; 10-v1.2-additions]*
921. **`/applekeynote`** — Use a minimal product-keynote presentation style. *[MACRO; 10-v1.2-additions]*
922. **`/minimal`** — Use a minimal visual/content style. *[MACRO; 10-v1.2-additions]*
923. **`/modern`** — Use a clean contemporary style. *[MACRO; 10-v1.2-additions]*
924. **`/premium`** — Use a polished high-end editorial style. *[MACRO; 10-v1.2-additions]*
925. **`/aesthetic`** — Emphasize a coherent stylized visual aesthetic. *[MACRO; 10-v1.2-additions]*
926. **`/thumbnailtext`** — Generate short text options for a thumbnail. *[MACRO; 10-v1.2-additions]*
927. **`/thumbnailaudit`** — Critique a thumbnail concept for clarity and impact. *[MACRO; 10-v1.2-additions]*
928. **`/titleaudit`** — Critique a title for clarity and effectiveness. *[MACRO; 10-v1.2-additions]*
929. **`/contentaudit`** — Review content quality, structure and weaknesses. *[MACRO; 10-v1.2-additions]*
930. **`/3dbillboard`** — Giant 3D billboard advertising concept. *[IMAGE KEYWORD; 10-v1.2-additions]*
931. **`/gravitydefying`** — Visually impossible gravity-defying composition. *[IMAGE KEYWORD; 10-v1.2-additions]*
932. **`/levitatingproduct`** — Product floating/levitating in space. *[IMAGE KEYWORD; 10-v1.2-additions]*
933. **`/floatingproduct`** — Product suspended against a clean background. *[IMAGE KEYWORD; 10-v1.2-additions]*
934. **`/zerogravity`** — Zero-gravity scene with floating elements. *[IMAGE KEYWORD; 10-v1.2-additions]*
935. **`/productinorbit`** — Product presented as an object in orbit. *[IMAGE KEYWORD; 10-v1.2-additions]*
936. **`/giantproduct`** — Oversized product dominating the environment. *[IMAGE KEYWORD; 10-v1.2-additions]*
937. **`/miniatureworld`** — Tiny diorama world built around the subject/product. *[IMAGE KEYWORD; 10-v1.2-additions]*
938. **`/productportal`** — Product emerging from or framed by a portal. *[IMAGE KEYWORD; 10-v1.2-additions]*
939. **`/impossiblebalance`** — Product/object balanced in a physically impossible way. *[IMAGE KEYWORD; 10-v1.2-additions]*
940. **`/impossiblearchitecture`** — Surreal, physically impossible architecture. *[IMAGE KEYWORD; 10-v1.2-additions]*
941. **`/surrealproductworld`** — Surreal environment built around a product. *[IMAGE KEYWORD; 10-v1.2-additions]*
942. **`/holographicbillboard`** — Futuristic holographic billboard concept. *[IMAGE KEYWORD; 10-v1.2-additions]*
943. **`/citytakeover`** — Product/brand visually taking over an urban environment. *[IMAGE KEYWORD; 10-v1.2-additions]*
944. **`/packshot`** — Clean commercial product packshot. *[IMAGE KEYWORD; 10-v1.2-additions]*
945. **`/adposter`** — Advertising-poster composition. *[IMAGE KEYWORD; 10-v1.2-additions]*
946. **`/newbg`** — Replace or redesign the image background. *[IMAGE KEYWORD; 10-v1.2-additions]*
947. **`/magazine_cover`** — Magazine-cover composition and typography space. *[IMAGE KEYWORD; 10-v1.2-additions]*
948. **`/add_object`** — Add a specified object to the scene. *[IMAGE KEYWORD; 10-v1.2-additions]*
949. **`/droneshot`** — Reframe the scene as a drone shot. *[IMAGE KEYWORD; 10-v1.2-additions]*
950. **`/cinematicphoto`** — Cinematic still-photo treatment. *[IMAGE KEYWORD; 10-v1.2-additions]*
951. **`/travelphoto`** — Travel-photography treatment. *[IMAGE KEYWORD; 10-v1.2-additions]*
952. **`/wildlife`** — Wildlife-photography treatment. *[IMAGE KEYWORD; 10-v1.2-additions]*

### Writing, editing & content refinement (47)

953. **`/write`** — Writes a complete text from the instructions. *[MACRO; 03-writing-languages-communication]*
954. **`/rewrite`** — Rewrite while maintaining the meaning. *[MACRO; 03-writing-languages-communication]*
955. **`/edit`** — Edit the text according to the indicated objective. *[MACRO; 03-writing-languages-communication]*
956. **`/proofread`** — Corrects typos, grammar and punctuation. *[MACRO; 03-writing-languages-communication]*
957. **`/grammar`** — Focuses on grammatical correctness. *[MACRO; 03-writing-languages-communication]*
958. **`/spelling`** — Focuses on spelling. *[MACRO; 03-writing-languages-communication]*
959. **`/punctuation`** — Improve punctuation. *[MACRO; 03-writing-languages-communication]*
960. **`/style`** — Improve style, pacing and readability. *[MACRO; 03-writing-languages-communication]*
961. **`/polish`** — Refine the text without changing its substantial content. *[MACRO; 03-writing-languages-communication]*
962. **`/shorten`** — Shorten text while preserving key information. *[MACRO; 03-writing-languages-communication]*
963. **`/expand`** — Expand the text with explanations or details. *[MACRO; 03-writing-languages-communication]*
964. **`/simplify`** — Simplify language and structure. *[MACRO; 03-writing-languages-communication]*
965. **`/clarify`** — Makes ambiguous passages clearer. *[MACRO; 03-writing-languages-communication]*
966. **`/formal`** — Use a formal register. *[MACRO; 03-writing-languages-communication]*
967. **`/informal`** — Use an informal register. *[MACRO; 03-writing-languages-communication]*
968. **`/friendly`** — Use a friendly and natural tone. *[MACRO; 03-writing-languages-communication]*
969. **`/professional`** — Use a professional and sober tone. *[MACRO; 03-writing-languages-communication]*
970. **`/technical`** — Use precise technical language. *[MACRO; 03-writing-languages-communication]*
971. **`/colloquial`** — Use a conversational and natural tone. *[MACRO; 03-writing-languages-communication]*
972. **`/neutral`** — Use a neutral and descriptive tone. *[MACRO; 03-writing-languages-communication]*
973. **`/persuasive`** — Structure a persuasive text that is not misleading. *[MACRO; 03-writing-languages-communication]*
974. **`/narrative`** — Transform content into narrative. *[MACRO; 03-writing-languages-communication]*
975. **`/storytelling`** — Strengthens narrative arc, pacing, and engagement. *[MACRO; 03-writing-languages-communication]*
976. **`/dialogue`** — Write or improve dialogue. *[MACRO; 03-writing-languages-communication]*
977. **`/description`** — Reinforce descriptions of places, people, or scenes. *[MACRO; 03-writing-languages-communication]*
978. **`/hook`** — Create an eye-catching opening. *[MACRO; 03-writing-languages-communication]*
979. **`/intro`** — Write an introduction. *[MACRO; 03-writing-languages-communication]*
980. **`/conclusion`** — Write a coherent conclusion. *[MACRO; 03-writing-languages-communication]*
981. **`/headline`** — Generate a main title. *[MACRO; 03-writing-languages-communication]*
982. **`/titles`** — Offers more alternative titles. *[MACRO; 03-writing-languages-communication]*
983. **`/subtitle`** — Generate a subtitle. *[MACRO; 03-writing-languages-communication]*
984. **`/caption`** — Write a caption. *[MACRO; 03-writing-languages-communication]*
985. **`/seo`** — Optimize structure and terms for SEO, without keyword stuffing. *[MACRO; 03-writing-languages-communication]*
986. **`/readability`** — Improves readability and fluency. *[MACRO; 03-writing-languages-communication]*
987. **`/tonecheck`** — Analyze the perceived tone. *[MACRO; 03-writing-languages-communication]*
988. **`/voicecheck`** — Check consistency of the authorial voice. *[MACRO; 03-writing-languages-communication]*
989. **`/continuity`** — Check narrative, temporal and factual continuity. *[MACRO; 03-writing-languages-communication]*
990. **`/editor`** — Performs a comprehensive editorial review. *[MACRO; 03-writing-languages-communication]*
991. **`/lineedit`** — Performs line-by-line review for style and accuracy. *[MACRO; 03-writing-languages-communication]*
992. **`/copyedit`** — Performs copy-editing for accuracy, consistency, and form. *[MACRO; 03-writing-languages-communication]*
993. **`/developmentaledit`** — Analyze the structure, flow, order, and development of content. *[MACRO; 03-writing-languages-communication]*
994. **`/factedit`** — Check for internal factual consistency and verifiable data. *[MACRO; 03-writing-languages-communication]*
995. **`/human`** — Rewrites text in a more natural, fluid, and human way, reducing artificial formulations. *[MACRO; 03-writing-languages-communication]*
996. **`/copywriter`** — Writes or rewrites texts using copywriting techniques aimed at clarity, persuasion, and conversion. *[MACRO; 03-writing-languages-communication]*
997. **`/promptengineer`** — Analyze and improve a prompt to make it clearer, more complete, and more effective. *[MACRO; 03-writing-languages-communication]*
998. **`/improve`** — Improve the content while preserving its intent and increasing clarity, quality, and accuracy. *[MACRO; 03-writing-languages-communication]*
999. **`/coverletter`** — Write a professional cover letter tailored to the role and context. *[MACRO; 03-writing-languages-communication]*

## Group totals

- Aliases & shorthand variants: 6
- Communication, email & social messaging: 26
- Comparison, evaluation & decision support: 22
- Documents, projects & automation: 46
- Education, learning & tutoring: 27
- General-purpose AI workflows: 30
- Hardware, maker & digital fabrication: 32
- Information extraction & knowledge organization: 47
- Output format & response control: 31
- Platform-native commands & interface controls: 34
- Reasoning, diagnosis & critical analysis: 41
- Research, discovery & source verification: 30
- Science, mathematics & data analysis: 51
- Software, coding & technical engineering: 159
- Translation, language & localization: 20
- Visual design, image generation & photography: 350
- Writing, editing & content refinement: 47

**Final count: 999 unique slash-command tokens.**
