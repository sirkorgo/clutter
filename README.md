# Clutter
### A lightweight planner app built in Node.js and Express, designed for students in mind.

## About Clutter
Clutter is a personal project I decided to make over the summer to help organize my school-life to prevent me from procrastinating.
I designed it around what I personally need in my school-life. In other words, *its a glorified todo list i made, using claude as a tutor to help me learn javascript*

Here's a feature list!
- **Tasks**
  - Just a basic to-do list that integrates with my Canvas account so I can see all my assignments and other tasks in one place.
- **Guides**
  - Roadmaps that help you plan out long projects in an organized way. Sorted by project, milestone, and task.

Currently, the project is in a very early development stage, and most features I have planned HAVEN'T been integrated yet. I may add more features depending on whether these features become too primitive for me.

## Live Demo
My instance of Clutter is up at [clutter.sirkorgo.com](https://clutter.sirkorgo.com) if you would like to try out Clutter.
Just sign in using your Google Account and that's it!

(small side note: since its in development, its not hooked up to a production server, its just reverse proxied to my macbook when im working on it, so it wont be up sometimes)

## Installation
### Dependencies
  - Docker (with Docker Compose)
  - Node.js (v26 or later)
  - oauth2-proxy
  - Express.js
  - Dotenv

**TL;DR**
  ```bash
  git clone https://github.com/sirkorgo/clutter.git
  cd clutter
  npm install
  docker compose up --build -d
  ```
**1. Clone the repo**
```bash
git clone https://github.com/sirkorgo/clutter.git
cd clutter
```
**2. Install NPM Dependencies
```bash
  npm install
```
**3. Run Docker Containers
```bash
docker compose up --build -d
```
## Usage
Clutter by default, is hosted at port 4180.
(ill write more once i finish clutter)
