# WhiskyApp — Product Requirements Document

## 1. Project Overview

### 1.1 Purpose

WhiskyApp is a web application for recording and tracking user whisky ratings from whisky tasting events. It enables event organizers to create tasting events, add whiskeys to those events, and allows authenticated users to rate each whiskey. Ratings are aggregated and displayed publicly.

### 1.2 Goals

- **Primary**: Provide a simple, intuitive platform for whisky tasting event management and rating
- **Secondary**: Enable discovery of highly-rated whiskeys across events
- **Tertiary**: Build a foundation that can be extended with social features, tasting notes, and analytics

### 1.3 Success Metrics

- Users can complete the full flow — view event → view whiskeys → rate a whiskey — in under 30 seconds
- System supports concurrent users at a tasting event without degradation — target 50 simultaneous users
- Admin can set up a new event with whiskeys in under 5 minutes

### 1.4 Scope — MVP

The MVP focuses on core event management and rating functionality. Advanced features such as tasting notes, whiskey images, social sharing, and analytics are explicitly out of scope.

---

## 2. User Personas and Roles

### 2.1 Admin

- **Who**: Event organizer or application owner
- **Needs**: Create and manage tasting events, add/remove whiskeys from events
- **Access**: Full CRUD on events and whiskeys; identified via a pre-configured admin list
- **Authentication**: Microsoft Entra ID (work/school or personal Microsoft account)

### 2.2 Authenticated User

- **Who**: Tasting event participant
- **Needs**: Rate whiskeys at events, view their own and aggregate ratings
- **Access**: Can rate whiskeys; can view all events, whiskeys, and ratings
- **Authentication**: Microsoft Entra ID sign-in

### 2.3 Anonymous User

- **Who**: Casual visitor or non-signed-in participant
- **Needs**: Browse events and view ratings
- **Access**: Read-only access to events, whiskeys, and aggregate ratings
- **Authentication**: None required

---

## 3. Functional Requirements

### FR-1: Event Management

| ID | Requirement | Role |
|----|-------------|------|
| FR-1.1 | Browse a list of all events with name and date | All users |
| FR-1.2 | View event details including its whiskey list | All users |
| FR-1.3 | Create a new event with name and date | Admin |
| FR-1.4 | Edit an existing event name and date | Admin |
| FR-1.5 | Delete an event and all associated data | Admin |

### FR-2: Whiskey Management

| ID | Requirement | Role |
|----|-------------|------|
| FR-2.1 | Browse whiskeys within an event | All users |
| FR-2.2 | View whiskey details including ratings | All users |
| FR-2.3 | Add a whiskey to an event with name, distillery, age, and type | Admin |
| FR-2.4 | Remove a whiskey from an event | Admin |

### FR-3: Rating System

| ID | Requirement | Role |
|----|-------------|------|
| FR-3.1 | Rate a whiskey on a 1–5 scale | Authenticated User |
| FR-3.2 | Update an existing rating | Authenticated User |
| FR-3.3 | Remove own rating from a whiskey | Authenticated User |
| FR-3.4 | View the current users own rating on the whiskey list | Authenticated User |
| FR-3.5 | View the overall average rating on the whiskey list | All users |
| FR-3.6 | View the total number of ratings for a whiskey | All users |

### FR-4: Authentication

| ID | Requirement | Role |
|----|-------------|------|
| FR-4.1 | Sign in with Microsoft Entra ID | All users |
| FR-4.2 | Sign out | Authenticated User, Admin |
| FR-4.3 | Display current user identity in the UI | Authenticated User, Admin |
| FR-4.4 | Persist user session across page refreshes | Authenticated User, Admin |

---

## 4. Non-Functional Requirements

### NFR-1: Performance

- Page load time under 2 seconds on 4G connection
- API response time under 500ms for all endpoints
- Support 50 concurrent users without degradation

### NFR-2: Security

- All mutations require authentication
- Admin operations require admin role verification
- No sensitive data stored client-side beyond session tokens
- HTTPS enforced for all traffic
- Input validation on both client and server

### NFR-3: Scalability

- Serverless architecture scales automatically with demand
- Database designed for horizontal scaling
- Stateless API design

### NFR-4: Availability

- Target 99.5% uptime — acceptable for MVP
- Graceful error handling with user-friendly messages

### NFR-5: Usability

- Mobile-responsive design — primary use case is rating at events on phones
- Intuitive navigation — no training required
- Accessible — WCAG 2.1 AA compliance target

### NFR-6: Cost

- Minimize Azure costs for MVP — serverless and consumption-based pricing preferred
- Target monthly cost under $20 for low-traffic MVP

---

## 5. User Stories

### 5.1 Anonymous User Stories

**US-A1**: As an anonymous user, I want to browse a list of tasting events so that I can see what events are available.
- **Acceptance Criteria**: Events page loads showing event names and dates, sorted by date descending.

**US-A2**: As an anonymous user, I want to view whiskeys in an event so that I can see what was tasted.
- **Acceptance Criteria**: Clicking an event shows a list of whiskeys with name, distillery, average rating, and rating count.

**US-A3**: As an anonymous user, I want to see the average rating for each whiskey so that I can discover popular whiskeys.
- **Acceptance Criteria**: Each whiskey in the list displays the average rating as a number — e.g. 4.2 — and the total number of ratings.

### 5.2 Authenticated User Stories

**US-U1**: As an authenticated user, I want to sign in with my Microsoft account so that I can rate whiskeys.
- **Acceptance Criteria**: A sign-in button triggers Entra ID OAuth flow; on success, the UI shows my name/avatar and the sign-in button is replaced with a sign-out button.

**US-U2**: As an authenticated user, I want to rate a whiskey on a 1–5 scale so that I can record my opinion.
- **Acceptance Criteria**: When viewing a whiskey in an event, I can select a rating from 1–5; the rating is saved immediately and reflected in the UI.

**US-U3**: As an authenticated user, I want to see my own rating alongside the average rating so that I can compare my taste.
- **Acceptance Criteria**: In the whiskey list, my rating is displayed next to the average rating; if I have not rated, a prompt to rate is shown.

**US-U4**: As an authenticated user, I want to update my rating so that I can change my mind.
- **Acceptance Criteria**: Selecting a different rating value replaces my previous rating; the average updates accordingly.

**US-U5**: As an authenticated user, I want to remove my rating so that I can retract my opinion.
- **Acceptance Criteria**: A clear/remove action removes my rating; the average and count update accordingly.

### 5.3 Admin User Stories

**US-D1**: As an admin, I want to create a new tasting event so that participants can rate whiskeys.
- **Acceptance Criteria**: A form allows entering event name and date; on submit, the event appears in the event list.

**US-D2**: As an admin, I want to add whiskeys to an event so that participants know what to taste.
- **Acceptance Criteria**: Within an event, a form allows entering whiskey name, distillery, age, and type; on submit, the whiskey appears in the event whiskey list.

**US-D3**: As an admin, I want to remove a whiskey from an event so that I can correct mistakes.
- **Acceptance Criteria**: A delete action on a whiskey removes it and all its ratings from the event; confirmation dialog is shown before deletion.

**US-D4**: As an admin, I want to delete an event so that I can clean up old or cancelled events.
- **Acceptance Criteria**: A delete action on an event removes it and all associated whiskeys and ratings; confirmation dialog is shown before deletion.

**US-D5**: As an admin, I want to edit event details so that I can fix typos or update dates.
- **Acceptance Criteria**: An edit form pre-populated with current values allows updating name and date.

---

## 6. Out of Scope — MVP

The following features are explicitly excluded from the MVP but may be considered for future iterations:

- Tasting notes or free-text comments on whiskeys
- Whiskey images or bottle photos
- User profiles or tasting history across events
- Social features — sharing, following, leaderboards
- Advanced analytics or reporting dashboards
- Multiple rating dimensions — currently single 1–5 score
- Event invitations or access control per event
- Whiskey database or catalog — whiskeys are event-specific
- Push notifications
- Offline support / PWA features

---

## 7. Assumptions and Constraints

### Assumptions

- Users have modern web browsers — Chrome, Firefox, Safari, Edge
- Users have internet connectivity during tasting events
- The number of whiskeys per event is small — typically 5–15
- The number of events is small for MVP — under 100
- Admin users are pre-configured — no self-service admin registration

### Constraints

- Azure as the sole cloud platform
- Microsoft Entra ID as the sole OAuth provider for MVP
- Budget-conscious architecture — consumption-based pricing
- Single-language UI — English only for MVP
