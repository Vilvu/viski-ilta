## Workspace-specific rules

### General Guidelines for Programming Languages

1. Clarity and Readability
   - Favor straightforward, self-explanatory code structures across all languages.
   - Include descriptive comments to clarify complex logic.

2. Language-Specific Best Practices
   - Adhere to established community and project-specific best practices for each language (Python, JavaScript, Java, etc.).
   - Regularly review language documentation and style guides.

3. Consistency Across Codebases
   - Maintain uniform coding conventions and naming schemes across all languages used within a project.

### Task Execution & Workflow

#### Task Definition & Steps

1. Specification
   - Define clear objectives, detailed requirements, user scenarios, and UI/UX standards.
   - Use advanced symbolic reasoning to analyze complex scenarios.

2. Pseudocode
   - Clearly map out logical implementation pathways before coding.

3. Architecture
   - Design modular, maintainable system components using appropriate technology stacks.
   - Ensure integration points are clearly defined for autonomous decision-making.

4. Refinement
   - Iteratively optimize code using autonomous feedback loops and stakeholder inputs.

5. Completion
   - Conduct rigorous testing, finalize comprehensive documentation, and deploy structured monitoring strategies.

#### AI Collaboration & Prompting

1. Clear Instructions
   - Provide explicit directives with defined outcomes, constraints, and contextual information.

2. Context Referencing
   - Regularly reference previous stages and decisions stored in the memory bank.

3. Suggest vs. Apply
   - Clearly indicate whether AI should propose ("Suggestion:") or directly implement changes ("Applying fix:").

4. Critical Evaluation
   - Thoroughly review all agentic outputs for accuracy and logical coherence.

5. Focused Interaction
   - Assign specific, clearly defined tasks to AI agents to maintain clarity.

6. Leverage Agent Strengths
   - Utilize AI for refactoring, symbolic reasoning, adaptive optimization, and test generation; human oversight remains on core logic and strategic architecture.

7. Incremental Progress
   - Break complex tasks into incremental, reviewable sub-steps.

8. Standard Check-in
   - Example: "Confirming understanding: Reviewed [context], goal is [goal], proceeding with [step]."

### Advanced Coding Capabilities

- Emergent Intelligence
  - AI autonomously maintains internal state models, supporting continuous refinement.
- Pattern Recognition
  - Autonomous agents perform advanced pattern analysis for effective optimization.
- Adaptive Optimization
  - Continuously evolving feedback loops refine the development process.

### Symbolic Reasoning Integration

- Symbolic Logic Integration
  - Combine symbolic logic with complexity analysis for robust decision-making.
- Information Integration
  - Utilize symbolic mathematics and established software patterns for coherent implementations.
- Coherent Documentation
  - Maintain clear, semantically accurate documentation through symbolic reasoning.

### Code Quality & Style

1. Type Safety Guidelines
   - Use strong typing systems (TypeScript strict mode, Python type hints, Java generics, Rust ownership) and clearly document interfaces, function signatures, and complex logic.

2. Maintainability
   - Write modular, scalable code optimized for clarity and maintenance.

3. Concise Components
   - Keep files concise (under 500 lines) and proactively refactor.

4. Avoid Duplication (DRY)
   - Use symbolic reasoning to systematically identify redundancy.

5. Linting/Formatting
   - Consistently adhere to language-appropriate linting and formatting tools (ESLint/Prettier for JS/TS, Black/flake8 for Python, rustfmt for Rust, gofmt for Go).

6. File Naming
   - Use descriptive, permanent, and standardized naming conventions.

7. No One-Time Scripts
   - Avoid committing temporary utility scripts to production repositories.

### Refactoring

1. Purposeful Changes
   - Refactor with clear objectives: improve readability, reduce redundancy, and meet architecture guidelines.

2. Holistic Approach
   - Consolidate similar components through symbolic analysis.

3. Direct Modification
   - Directly modify existing code rather than duplicating or creating temporary versions.

4. Integration Verification
   - Verify and validate all integrations after changes.

### Testing & Validation

1. Test-Driven Development
   - Define and write tests before implementing features or fixes.

2. Comprehensive Coverage
   - Provide thorough test coverage for critical paths and edge cases.

3. Mandatory Passing
   - Immediately address any failing tests to maintain high-quality standards.

4. Manual Verification
   - Complement automated tests with structured manual checks.

### Debugging & Troubleshooting

1. Root Cause Resolution
   - Employ symbolic reasoning to identify underlying causes of issues.

2. Targeted Logging
   - Integrate precise logging for efficient debugging.

3. Research Tools
   - Use advanced agentic tools (Perplexity, AIDER.chat, Firecrawl) to resolve complex issues efficiently.

4. Advanced Debugging Techniques
   - Apply binary search debugging for efficient issue isolation in large codebases.
   - Use differential debugging: compare working vs non-working states to identify differences.
   - Use state snapshot analysis for intermittent issues that are difficult to reproduce.

### Security

1. Server-Side Authority
   - Maintain sensitive logic and data processing strictly server-side.

2. Input Sanitization
   - Enforce rigorous server-side input validation.

3. Credential Management
   - Securely manage credentials via environment variables; avoid any hardcoding.

4. Threat-Aware Design
   - Apply least privilege principle: grant minimum permissions necessary for component function.
   - Implement defense in depth: multiple security layers rather than single controls.

### Version Control & Environment

1. Git Hygiene
   - Commit frequently with clear and descriptive messages.

2. Branching Strategy
   - Adhere strictly to defined branching guidelines.

3. Environment Management
   - Ensure code consistency and compatibility across all environments.

4. Server Management
   - Systematically restart servers following updates or configuration changes.

### Documentation Maintenance

1. Reflective Documentation
   - Keep comprehensive, accurate, and logically structured documentation updated through symbolic reasoning.

2. Continuous Updates
   - Regularly revisit and refine guidelines to reflect evolving practices and accumulated project knowledge.

### Performance & Reliability

1. Fault Tolerance Design
   - Implement graceful degradation: provide essential functionality during partial failures.
   - Apply circuit breaker patterns to prevent cascading failures in distributed systems.

2. Performance Optimization
   - Design for horizontal scaling through stateless architecture.
   - Apply caching strategies with consideration for cache invalidation and consistency.

### Technical Decision Documentation

1. Architecture Decision Records (ADRs)
   - Document significant technical decisions with context, options considered, and rationale.
   - Track architectural evolution and decision impact over time.

2. Trade-off Analysis
   - Explicitly evaluate and document technical trade-offs in autonomous decision-making.
   - Consider reversibility: prefer decisions that maintain future options when facing uncertainty.

### Legacy System Integration

1. Incremental Modernization
   - Apply strangler fig pattern: gradually replace legacy components by intercepting calls.
   - Implement anti-corruption layers between new and legacy systems for clean boundaries.

## Project-specific rules

### General Project Management
- Each [PROJECT_NAME] maintains its own separate git repository

## MCP Servers — Advisory Usage Guidelines

These guidelines describe recommended ways to use configured MCP servers in this workspace. They are advisory, not mandatory, and intended to improve consistency, safety, and output quality.

### General MCP Guidance
- MCP tools should be preferred when they provide **more accurate, verifiable, or automatable** results than free‑form reasoning.
- It is recommended to be explicit about:
  - Which MCP server/tool is used and the reason for using it
  - What input is provided
  - What output is expected and how it will be interpreted
- Sensitive information handling:
  - Avoid sending credentials, tokens, personal data, or internal-only secrets to MCP tools unless clearly safe and intentional.
- Scope control:
  - Prefer the smallest query or action that satisfies the task.
  - Broad crawling or large downloads should be avoided unless clearly justified.
- Output validation:
  - MCP outputs should be sanity-checked, especially when used for decisions, code, or security-relevant changes.
  - When results appear uncertain, a secondary check or alternative approach is recommended.

---

### Context7 (Documentation / Library Context)
**Purpose:** Assist with retrieving accurate documentation snippets, API references, and example patterns.

**Recommended usage:**
- When working with unfamiliar frameworks, libraries, or APIs
- When version-specific behavior matters
- When correctness of signatures, parameters, or usage patterns is critical

**Guidelines:**
- Prefer targeted queries (library + feature + keyword).
- Use retrieved documentation as a reference and adapt it to project conventions and constraints.
- Summarize relevant findings and translate them into **project-specific implementation guidance**.

**Notes:**
- Copying large documentation sections verbatim is discouraged.
- Documentation should be reconciled with existing code and architecture.

---

### memory (Persistent Workspace Memory)
**Purpose:** Assist with retaining durable, high-value project context across sessions.

**Well-suited content:**
- Stable architectural or technical decisions
- Reusable conventions or constraints
- Integration details that are costly to rediscover

**Guidelines:**
- Memory entries should be:
  - Durable
  - High-value
  - Non-sensitive
- Prefer structured entries such as:
  - Decision → Rationale → Context → Implications
- If information changes, updating or replacing existing memory entries is recommended.

**Notes:**
- Secrets, personal data, and short-lived task status should generally not be stored in memory.
- Temporary work belongs in repository documentation (e.g., TODO.md, journal entries).

---

### playwright (Browser Automation / UI Validation)
**Purpose:** Assist with browser automation, UI validation, and reproducible UI checks.

**Recommended usage:**
- End-to-end flow validation where appropriate
- UI regression checks
- Confirming selectors, navigation flows, and rendering behavior

**Guidelines:**
- Prefer stable selectors (e.g., data-testid, roles) over brittle selectors.
- Explicit waits and synchronization are recommended.
- Capture relevant artifacts (screenshots, logs) when useful for diagnosis.

**Safety considerations:**
- Destructive, privileged, or irreversible actions should be avoided unless explicitly intended.
- Credentials should not be hardcoded; prefer environment-based configuration.

---

### sequentialthinking (Structured Multi-Step Reasoning)
**Purpose:** Assist with breaking down complex or ambiguous tasks into structured reasoning and plans.

**Recommended usage:**
- Architectural or design decisions involving trade-offs
- Multi-step refactors or migrations
- Complex debugging scenarios
- Feature planning with dependencies and risks

**Guidelines:**
- Use to outline:
  - Problem framing
  - Assumptions
  - Options and trade-offs
  - Recommended approach
  - Step-by-step plan
  - Risks and validation steps
- Plans should remain adaptable as new information emerges.

**Notes:**
- Simple or well-understood tasks usually do not require extended structured reasoning.
- Prefer direct execution when complexity is low.
