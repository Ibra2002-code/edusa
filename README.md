# École Connect

We are building the first production-quality UI for EDUSA, a school attendance and parent-notification platform.

The entire EDUSA platform UI must be in FRENCH.

IMPORTANT:

For this step, focus ONLY on the UI/UX and frontend structure.

Do NOT implement real authentication, database logic, Excel importing, WhatsApp integration, or backend functionality yet.

Use realistic mock data so the interfaces can be fully previewed.

PRODUCT WORKFLOW

EDUSA is used by schools.

There are two authenticated user roles:

1. ADMINISTRATOR

The administrator manages the school:

- Import the student list

- Manage parent phone numbers

- Add/remove classes

- Add/remove teachers

- Assign teachers to classes

- View the overall school information

2. TEACHER

The teacher has a very simple workflow:

- Log in

- See only their assigned classes

- Select a class

- See the students in that class

- Mark absent students

- Review the attendance

- Click "Notify Parents"

PARENTS DO NOT NEED AN ACCOUNT FOR THIS MVP.

Parents only receive WhatsApp notifications when a teacher reports their child absent.

CORE WORKFLOW

School purchases EDUSA

→ Administrator creates the school

→ Administrator imports students

→ Administrator manages parent phone numbers

→ Administrator creates classes

→ Administrator adds teachers

→ Administrator assigns teachers to classes

→ Teacher logs in

→ Teacher sees only assigned classes

→ Teacher selects a class

→ Teacher marks absent students

→ Teacher reviews attendance

→ Teacher clicks "Notify Parents"

→ Parents receive WhatsApp notifications

UI STRUCTURE

Create a professional responsive web application with these routes/screens:

PUBLIC:

- /login

ADMIN:

- /admin/dashboard

- /admin/students

- /admin/classes

- /admin/teachers

- /admin/parents

TEACHER:

- /teacher/dashboard

- /teacher/classes

- /teacher/classes/:classId/attendance

ADMIN DASHBOARD

Create a clean dashboard showing:

- School name

- Total students

- Total teachers

- Total classes

- Today's attendance

- Today's absences

- Recent attendance activity

Include a sidebar navigation:

- Dashboard

- Students

- Classes

- Teachers

- Parents

- Settings

STUDENTS PAGE

Create a student-management table with:

- Student name

- Class

- Parent name

- Parent phone

- Status

Include:

- Search

- Class filter

- Add student button

- Import students button

The Import button is UI only for now.

CLASSES PAGE

Show classes as cards or a clean table.

Each class should display:

- Class name

- Number of students

- Assigned teacher

Include:

- Add class

- Edit class

- Remove class

- Assign teacher

TEACHERS PAGE

Show teachers with:

- Name

- Email

- Assigned classes

- Status

Include:

- Add teacher

- Edit teacher

- Remove teacher

- Assign classes

PARENTS PAGE

Show:

- Parent name

- Student name

- Phone number

- WhatsApp notification status

Include search and filters.

TEACHER DASHBOARD

The teacher dashboard must be MUCH simpler than the administrator dashboard.

Show:

- Teacher name

- Today's date

- "My Classes"

Only display classes assigned to the logged-in teacher.

Each class should have a clear "Take Attendance" button.

ATTENDANCE SCREEN

Create the most important screen in the application.

Display:

- Class name

- Date

- Number of students

- Search students

Display every student with:

- Student name

- Present/Absent status

Make "Present" the default state.

The teacher should be able to quickly mark a student absent.

Use a clear interaction such as:

[Present] [Absent]

At the bottom provide:

- Number present

- Number absent

- "Review Attendance" button

REVIEW SCREEN

Before sending notifications, show a confirmation screen:

"Attendance Summary"

Present: XX

Absent: XX

List absent students.

Then show:

"Notify Parents"

with a clear primary button.

Since WhatsApp integration is not being implemented yet, clicking the button should only display a realistic success confirmation such as:

"Notifications queued successfully"

Do not implement actual WhatsApp messaging yet.

DESIGN

The application should feel like a modern professional SaaS product designed for schools.

Use:

- Clean typography

- Spacious layouts

- Clear hierarchy

- Professional dashboard cards

- Responsive design

- Accessible buttons and forms

- Consistent icons

- Mobile-friendly teacher attendance interface

The teacher attendance screen should be especially optimized for quick use on a phone or tablet.

Do not overload the teacher interface with administration features.

Use realistic Somali/French school-oriented mock data.

Example classes:

- 5ème A

- 6ème A

- 7ème A

- 8ème A

- 9ème A

Use realistic Somali student and teacher names.

IMPORTANT PRODUCT PRINCIPLE:



The administrator handles the complexity.

The teacher handles attendance.

Keep this principle visible throughout the UI.

Do not build features that are not required by this workflow.

At the end, make sure the navigation between all screens works using mock frontend state/data.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://edusa-app-fr.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ad20933-5b62-4448-a656-f966517e6f0a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev

