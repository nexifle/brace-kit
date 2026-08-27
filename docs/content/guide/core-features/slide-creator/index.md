+++
title = "Builder"
description = "Create, review, edit, and export presentation decks with BraceKit."
weight = 15
template = "page.html"

[extra]
category = "Core Features"
+++

# Builder

Builder turns a plain-language idea into slides or a website (one page or many). Choose the kind of project, describe what you want, answer a few questions, review the plan, and let BraceKit build it in an interactive workspace. You can then ask for changes. Slides export as a ZIP of PNG images; sites export as a static HTML zip.

## Before you begin

Slide Creator uses your selected AI model to plan and build the deck. Choose a model that supports **tool use** or **function calling**. If your current model cannot use tools, BraceKit shows a warning in the composer and you can switch models in [AI Provider settings](/guide/configuration/ai-provider/).

The generated slides are presentation-ready HTML and CSS. You do not need to write code yourself; describe the content and visual direction in your messages.

## Open Builder

1. Open the BraceKit sidebar.
2. Choose **Slide Creator** from the feature picker or workspace controls.
3. Choose **Open in Tab** when you want a larger, focused canvas. Choose **Stay in Sidebar** to keep working beside the current page.

The Slide Creator workspace has two main areas:

- **Chat** — describe the deck, answer questions, see the agent's progress, and request edits.
- **Preview** — inspect the current slide and move through the deck.

On a narrow window, use the **Preview** and **Chat** toggle to switch between the two views.

## Create your first deck

### 1. Describe the outcome

Enter a prompt such as:

> Create a 7-slide product roadmap presentation for a mobile fitness app. Use a confident, editorial style and include a timeline, product pillars, and a final call to action.

Include as much of the following as you know:

- Audience and purpose
- Number of slides
- Main message or story
- Important facts, figures, or copy
- Tone and visual references
- Preferred slide size

You can attach images or text files from the composer when the deck should use reference material or supplied content. See [File Attachments](/guide/core-features/attachments/) for attachment basics.

### 2. Choose a canvas

Slide Creator supports these canvas sizes:

| Canvas | Best for |
|---|---|
| **16:9 Landscape** | Presentations, meetings, and widescreen displays |
| **4:5 Instagram** | Portrait feed posts and carousel graphics |
| **9:16 Story** | Stories, reels, and phone-first visuals |
| **1:1 Square** | Square social posts and compact visual summaries |

If your first prompt does not specify a size, the agent asks you to choose one before planning continues.

### 3. Answer clarifying questions

During planning, the agent may ask about the audience, content, canvas, or visual direction. Answer the question in the prompt card to continue. You can cancel the plan if you need to start over.

The chat shows the current phase, model activity, tool progress, and files being created. This lets you see whether BraceKit is planning, waiting for your answer, or building the deck.

### 4. Select a working mode

Use the mode toggle in the Slide Creator header:

- **Plan** — review the proposed content and visual direction before slides are built. This is the best choice when accuracy or messaging matters.
- **Agent** — automatically continue from planning into slide building after the plan is complete. Use this when you want a faster first draft.

Both modes create the plan documents. Agent mode simply skips the manual pause before building.

### 5. Review the plan

In Plan mode, Slide Creator displays **Plan ready to build** with two tabs:

- **Brief** — content and structure for each slide.
- **Design** — the deck-wide visual system, including the look, layout rules, and styling direction.

Read both tabs before selecting **Build slides**. Select **Edit** if you want to adjust the plan, make your changes, and select **Save**. Select **Discard** to abandon unsaved edits.

### 6. Watch the deck build

After you select **Build slides**, the preview updates as slides are written. The activity feed shows the current model round, actions, and slide files. You can select a file entry to jump to the related slide when available.

When the build finishes, the filmstrip appears below the preview. Select a thumbnail to inspect that slide.

## Work with the preview

Use the controls around the preview to:

- Move to the previous or next slide.
- See the current slide number and total slide count.
- Check the deck's canvas dimensions.
- Open the project documents with **Docs**.
- View the current slide's HTML or CSS from the additional actions menu.
- Open the round history to review earlier generated versions.

The preview can show a partial deck while a build is still running. A **Live · updating** indicator means the preview is receiving changes.

### Project documents

Select **Docs** to inspect the deck's Brief, Design, and uploaded files. Use these documents to check the source material the agent is using without leaving the project.

## Ask for changes

When the deck is ready, use the composer below the chat to describe an edit in natural language. For example:

- “Make the title slide darker and increase the title size.”
- “Turn slide 3 into a two-column comparison.”
- “Use the attached logo on the final slide.”
- “Shorten the body copy on every slide and keep the key numbers.”
- “Move the pricing slide before the call to action.”

Slide Creator applies follow-up requests to the existing deck instead of requiring you to start again. Review the preview after each change and continue with another request if needed.

Select the **Stop** control to stop a running plan or build. Work completed before stopping is kept in the project. If a phase fails, read the error in the chat and use the retry action after fixing the model or request.

## Manage previous decks

Select **Previous decks** (the history icon) to reopen a project. From the history view you can:

- Search decks by title.
- Reopen a deck and continue editing it.
- Start a new deck.
- Delete a deck after confirming the action.

Decks are saved locally in your browser, so reopening a project uses the same browser profile and extension storage where it was created.

## Export the deck

When the deck contains at least one completed slide and no agent phase is running:

1. Select the **Download** button in the preview header.
2. Wait while BraceKit renders each slide.
3. Save the downloaded ZIP file.

The ZIP contains one PNG per slide, named in deck order. The download button is unavailable while the agent is working, while no slides exist, or when the deck has no selected canvas size.

If one slide cannot be captured, BraceKit exports the slides that succeeded and reports which slide numbers failed. If every slide fails, no ZIP is created; check the preview and retry the export.

## Prompt tips

Good prompts give the agent a clear job and useful constraints. Compare:

- **Vague:** “Make some slides about our company.”
- **Specific:** “Create a 5-slide 16:9 investor update for a climate software company. Explain the problem, show Q2 traction with the supplied figures, introduce the roadmap, and end with the funding ask. Use a calm dark-green and cream visual style with short copy and strong data callouts.”

For reliable results:

1. State the audience and purpose first.
2. Give a target slide count or list the sections you need.
3. Provide exact numbers and wording that must not change.
4. Describe the desired tone, colors, and visual references.
5. Request one focused edit at a time when refining the deck.

## Troubleshooting

### The composer says the model cannot use tools

Switch to a model with tool use or function-calling support in [AI Provider settings](/guide/configuration/ai-provider/). Slide Creator cannot plan or build while the selected model is blocked from using tools.

### The agent is waiting for me

Look for the question card in Chat. Select an answer or provide the requested detail. The plan resumes after you submit it. If the question is no longer relevant, cancel the plan and send a new prompt.

### The preview is empty or only partly complete

A partial preview is expected while a deck is building. Wait for the build to finish, check the activity feed for an error, and retry the failed phase if one is available. Confirm that a canvas size was selected.

### Export is unavailable

Export requires at least one completed slide, a selected canvas size, and an idle agent. Wait for the build or edit to finish, then try again.

### I want to start over

Select **New deck** and send a fresh prompt. Your earlier project remains in Previous decks until you delete it.

## Related guides

- [Chat Interface](/guide/core-features/chat/)
- [File Attachments](/guide/core-features/attachments/)
- [AI Providers](/guide/ai-providers/)
- [AI Provider Configuration](/guide/configuration/ai-provider/)
- [Troubleshooting](/guide/reference/troubleshooting/)
