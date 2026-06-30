document.addEventListener("DOMContentLoaded", () => {
   showPage()
});
window.addEventListener('hashchange', showPage)
const tabs = document.querySelector('md-tabs')
tabs.addEventListener('change', () => {
    let pgNames = ["summary", "tasks", "guides"]
    let active = tabs.activeTabIndex
    let name = pgNames[active]

    window.location.hash = name
})

function showPage() {
    let hash = window.location.hash.replace('#', '');
    if (hash === '') {
        hash = 'summary'
        window.location.hash = 'summary'
    };
    
    let pages = document.querySelectorAll('.page');

    for (let page of pages) {
        page.classList.remove('active')
    }

    for (let page of pages) {
        if (page.id === hash) {
            page.classList.add('active');
        };
    };
}