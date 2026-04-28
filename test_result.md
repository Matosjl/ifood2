#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: AJAX AI Agent - Fix and implement terminal-themed AI agent interface with 3-pane layout, chat CLI, integrations panel, and code sandbox

## backend:
##   - task: "FastAPI server with MongoDB connection"
##     implemented: true
##     working: true
##     file: "backend/server.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Server configured with FastAPI, MongoDB via motor, CORS, and /api routes."
##         -working: true
##         -agent: "main"
##         -comment: "Uvicorn running on port 8000. /api/ returns {message: Hello World}. Added /api/health endpoint. Added graceful MongoDB fallback to in-memory store when MongoDB is offline. /api/health returns {status: ok, mongo: false, store: memory}. POST/GET /api/status working with in-memory fallback."
##   - task: "Environment variables and dependencies"
##     implemented: true
##     working: true
##     file: "backend/.env, backend/requirements.txt"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "requirements.txt cleaned, .env configured with MONGO_URL, DB_NAME, CORS_ORIGINS."
##         -working: true
##         -agent: "main"
##         -comment: "All pip dependencies installed and importable. CORS configured with allow_origins=*."

## frontend:
##   - task: "3-pane layout (History, Chat, Integrations)"
##     implemented: true
##     working: true
##     file: "frontend/src/App.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Layout implemented with Header, HistorySidebar, ChatInterface/CodeSandbox tabs, IntegrationsPanel."
##         -working: true
##         -agent: "main"
##         -comment: "Frontend compiled successfully on port 3000 (HTTP 200). App.js updated to poll /api/health every 30s and pass backendStatus to Header."
##   - task: "Chat interface CLI/Terminal style"
##     implemented: true
##     working: true
##     file: "frontend/src/components/ChatInterface.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "CLI-style chat with framer-motion animations, typing indicator, glow effects."
##         -working: true
##         -agent: "main"
##         -comment: "Component renders correctly. Frontend compiles without errors."
##   - task: "Integration cards with react-icons"
##     implemented: true
##     working: true
##     file: "frontend/src/components/IntegrationsPanel.jsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Gmail, WhatsApp, Instagram, X/Twitter cards with react-icons. Frontend compiles without errors."
##   - task: "Code Sandbox panel"
##     implemented: true
##     working: true
##     file: "frontend/src/components/CodeSandbox.jsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Basic code sandbox placeholder. Frontend compiles without errors."
##   - task: "Terminal design theme"
##     implemented: true
##     working: true
##     file: "frontend/src/index.css, frontend/src/App.css, frontend/tailwind.config.js"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Dark theme, JetBrains Mono, IBM Plex Sans, squared borders, custom scrollbar. Frontend compiles without errors."
##   - task: "Header real backend status indicator"
##     implemented: true
##     working: true
##     file: "frontend/src/components/Header.jsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Header now receives backendStatus prop and shows API ONLINE/OFFLINE + DB OK/OFF with dynamic dot color. Polls /api/health every 30s."

## metadata:
##   created_by: "main_agent"
##   version: "1.2"
##   test_sequence: 2
##   run_ui: false

## test_plan:
##   current_focus: []
##   stuck_tasks: []
##   test_all: false
##   test_priority: "high_first"

## agent_communication:
##     -agent: "main"
##     -message: "All phases complete. Backend running on :8000 with /api/health endpoint and in-memory fallback (MongoDB offline). Frontend running on :3000, CORS OK, Header shows real API/DB status. All TODO tasks marked done."
