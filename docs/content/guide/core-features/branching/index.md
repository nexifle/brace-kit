+++
title = "Conversation Branching"
description = "Fork conversations to explore alternatives without losing context."
weight = 24
template = "page.html"

[extra]
category = "Core Features"
+++

# Conversation Branching

Branching lets you create alternative conversation paths without losing your original context. Perfect for exploring different solutions, trying new approaches, or going down tangents.

## What is Branching?

When you branch a conversation:
1. A new conversation is created
2. All messages up to the branch point are copied
3. The original conversation remains unchanged
4. You can continue in either direction

## How to Branch

1. Find the message you want to branch from
2. Hover over the message (any message type)
3. Click the **branch icon** (git branch symbol)
4. A new conversation opens with all messages up to that point

### What Gets Copied

- All messages before and including the branch point
- The system prompt (if customized)
- Conversation title (same as original)

### What Doesn't Get Copied

- Messages after the branch point
- Streaming state

## Use Cases

### Exploring Solutions

```
Original: "How do I sort an array?"
AI: "You can use .sort()..."

[Branch here]
New direction: "What about sorting objects by a property?"
```

### Trying Different Models

1. Have a conversation with GPT-4
2. Branch from an interesting point
3. Switch to Claude
4. Continue to see how it approaches the problem differently

### Going Down Tangents

1. Main conversation: Learning about React
2. Branch: Deep dive into a specific hook
3. Return to main conversation when done

### A/B Testing Prompts
1. Branch before a critical question
2. Try different phrasings in each branch
3. Compare results

## Managing Branches

### In History Drawer

Branched conversations appear alongside the original, They share the same title, making it easy to find related conversations.

### Tips

1. **Rename branches**: Double-click to give meaningful names like "Flexbox approach" vs "Grid approach"

2. **Delete unused branches**: If a branch doesn't pan out, delete it to keep history clean

3. **Pin important branches**: Star branches you want to reference later

### Workflow Example

```
1. Start conversation about implementing authentication
2. AI suggests JWT approach
3. Branch before asking about sessions
4. In branch: explore session-based auth
5. Compare both approaches
6. Return to original to implement JWT
7. Or switch to branch to implement sessions
```

## Limitations
- Images and attachments are copied by reference
- Very long conversations may take a moment to branch
