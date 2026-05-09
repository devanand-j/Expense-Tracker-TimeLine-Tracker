# End-to-End Application Workflow

## 1. Login and Access

1. User opens the app.
2. User signs in with Google.
3. Supabase Auth creates or loads the session.
4. The app loads the profile from `profiles`.
5. The role is resolved as `admin` or `employee`.
6. Navigation and access rights change based on the role.

## 2. First-Time Onboarding

1. New employee opens the onboarding page.
2. Employee fills personal details, address, bank details, and required declarations.
3. Employee uploads documents such as Aadhaar, PAN, resume, photo, and bank proof.
4. Employee submits onboarding data.
5. Admin reviews the onboarding request.
6. Admin approves, rejects, or requests changes.
7. The employee receives the result through notifications.
8. Approved onboarding data becomes the active employee profile record.

## 3. Daily Employee Flow

1. Employee opens the dashboard.
2. Employee checks assigned projects, recent status, and alerts.
3. Employee fills the timeline entry for the day if required.
4. Employee fills the weekly timesheet.
5. Employee saves progress or submits the timesheet for approval.
6. If the week is partially approved, only the approved days lock.
7. Remaining unapproved days stay editable.
8. After timesheet approval, the employee can submit expenses for approved working days.
9. Employee can also submit leave requests when needed.
10. Employee can use material tracking forms for pickup, arrival, return, and warehouse return if that module applies.

## 4. Timesheet Workflow

1. Employee selects the week.
2. Employee fills hours for each day and project row.
3. Employee saves as draft or submits for review.
4. Admin opens the Admin Hub and reviews the submitted sheet.
5. Admin chooses one of the available actions:
	- Approve
	- Needs Changes
	- Revoke
	- Reject
6. Approved days become locked for the employee.
7. If only two days are approved, the employee can still fill the remaining days.
8. If the full week is approved, the sheet becomes fully locked.
9. Any review action is written to audit logs and notifications.

## 5. Expense Workflow

1. Employee opens the expense page.
2. Employee selects category, project, date, amount, and notes.
3. Employee uploads the receipt image.
4. The system validates the expense against business rules.
5. Expense submission is allowed only after the related timesheet approval rules are satisfied.
6. Employee submits the expense.
7. Admin reviews the expense in the Admin Hub.
8. Admin approves or rejects the expense.
9. Approved expenses can flow into the reimbursement ledger.
10. The employee receives the result in notifications.

## 6. Leave Workflow

1. Employee opens the leave page.
2. Employee selects leave type, dates, subject, and explanation.
3. Employee submits the leave request.
4. Admin reviews the request.
5. Admin approves or rejects the leave.
6. Leave approval affects timesheet and expense validation rules.
7. The employee receives the result in notifications.

## 7. Material Tracking Workflow

1. Employee or field user opens the material tracking page.
2. User records the relevant stage:
	- Warehouse pickup
	- Field arrival
	- Return start
	- Warehouse return
3. User enters the person name, location, photos, and material details.
4. Photo upload and map location capture are used during the submission.
5. The record is saved to the material tracking logs.
6. Admin can review material tracking history from the admin area.

## 8. Admin Workflow

1. Admin opens the Admin Hub.
2. Admin selects an employee.
3. Admin reviews timeline, timesheets, expenses, leave requests, onboarding, and reimbursement data.
4. Admin can approve, reject, request changes, revoke, or delete records where allowed.
5. Admin can assign projects to employees.
6. Admin can review audit logs.
7. Admin can view pending approval counts and jump to the relevant section.
8. Every admin action is logged for traceability.

## 9. Notifications Workflow

1. Status changes create in-app notifications.
2. Employees open the notifications drawer from the header.
3. Users can read, mark as read, or delete notifications.
4. Admins also see pending approval counts in the header.
5. Notification events are tied to timesheets, expenses, leave, and other status changes.

## 10. Audit Log Workflow

1. Approval, rejection, and status changes write to audit logs.
2. Audit logs capture who changed the record, what changed, when it changed, and why.
3. Admins open the Audit Logs tab in the Admin Hub.
4. Admins filter logs by table, action, and date range.
5. Audit logs provide the compliance trail for the whole application.

## 11. Reporting Workflow

1. Employee or admin opens the Reports page.
2. The app summarizes timesheets, expenses, leave, and project data.
3. Reports can be exported to PDF or XLSX.
4. Admins use reports for review, compliance, and planning.

## 12. Project Master Workflow

1. Admin opens Project Master.
2. Admin creates or updates projects.
3. Admin assigns employees to projects.
4. Timesheet and expense validation use project assignments to prevent invalid entries.

## 13. Full Application Rule Summary

- Login happens first through Google sign-in.
- Onboarding comes before regular work use for new employees.
- Timesheet submission is the base workflow.
- Timesheet approval unlocks the next expense step.
- Partially approved weeks stay partially editable.
- Leave and timesheet rules affect expense eligibility.
- Admin actions are always reviewed through the Admin Hub.
- Notifications show the latest status to users.
- Audit logs preserve the full action history.

## 14. Simple End-to-End Example

1. Employee signs in with Google.
2. Employee completes onboarding.
3. Employee fills the weekly timesheet.
4. Admin approves some or all days.
5. Employee fills any remaining editable timesheet days.
6. Employee submits expenses after the approved timesheet condition is satisfied.
7. Admin reviews and approves or rejects the expense.
8. Employee receives notifications.
9. Admin checks audit logs if needed.
10. Reports are exported when management needs them.

## Related Screens

- Login Page: Google sign-in
- Onboarding Page: employee setup
- Dashboard Page: overview
- Timeline Page: daily activity input
- Timesheet Page: weekly submission
- Expenses Page: expense claims
- Leave Page: leave requests
- Material Tracking Page: material workflow
- Admin Hub: approvals and review
- Reports Page: exports and summaries
- Audit Logs tab: compliance history
- Notifications panel: status updates
