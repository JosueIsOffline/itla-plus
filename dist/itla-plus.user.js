// ==UserScript==
// @name         ITLA Plus
// @namespace    https://github.com/JosueIsOffline
// @version      1.3.1
// @description  Suite modular de herramientas para mejorar la experiencia en la plataforma virtual del ITLA.
// @author       JosueIsOffline
// @match        https://aulavirtual.itla.edu.do/*
// @match        https://virtual.itsc.edu.do/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @resource     INTERNAL_CSS https://raw.githubusercontent.com/JosueIsOffline/itla-plus/main/src/styles.css
// @updateURL    https://github.com/JosueIsOffline/itla-plus/releases/latest/download/itla-plus.user.js
// @downloadURL  https://github.com/JosueIsOffline/itla-plus/releases/latest/download/itla-plus.user.js
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    class DOM {
        static async waitForElement(selector, timeout = 5000) {
            return new Promise((resolve) => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                const observer = new MutationObserver(() => {
                    const element = document.querySelector(selector);
                    if (element) {
                        observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve(element);
                    }
                });
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
                const timeoutId = setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeout);
            });
        }
        static async waitForElements(selectors, timeout = 5000) {
            return Promise.all(selectors.map((selector) => this.waitForElement(selector, timeout)));
        }
        static fillInput(input, value) {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        static safeClick(element) {
            if (typeof element.click === "function") {
                element.click();
            }
            else {
                const event = new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                });
                element.dispatchEvent(event);
            }
        }
        static getInput(identifier) {
            let input = document.querySelector(`input[name="${identifier}"]`);
            if (!input) {
                input = document.querySelector(`#${identifier}`);
            }
            if (!input) {
                input = document.querySelector(identifier);
            }
            return input;
        }
        static getButton(identifier) {
            let button = document.querySelector(`#${identifier}`);
            if (!button) {
                button = document.querySelector(identifier);
            }
            if (!button) {
                const buttons = Array.from(document.querySelectorAll("button"));
                button =
                    buttons.find((btn) => btn.textContent
                        ?.trim()
                        .toLowerCase()
                        .includes(identifier.toLowerCase())) || null;
            }
            return button;
        }
        static isOnPage(urlPattern = "https://aulavirtual.itla.edu.do/") {
            const pattern = urlPattern.replace(/\*/g, ".*").replace(/\?/g, "\\?");
            const regex = new RegExp(pattern);
            return regex.test(window.location.href);
        }
        static onDOMReady(callback) {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", callback);
            }
            else {
                callback();
            }
        }
        static observerElemnt(element, callback, options = {
            childList: true,
            subtree: true,
            attributes: true,
        }) {
            const observer = new MutationObserver(callback);
            observer.observe(element, options);
            return observer;
        }
    }

    class MonkeyStorage {
        async set(key, value) {
            const serialized = JSON.stringify(value);
            await GM.setValue(key, serialized);
        }
        async get(key, defaultValue) {
            const serialized = await GM.getValue(key, null);
            if (serialized === null) {
                return defaultValue ?? null;
            }
            try {
                return JSON.parse(serialized);
            }
            catch (e) {
                console.error(`Error parsing key "${key}":`, e);
                return defaultValue ?? null;
            }
        }
        async remove(key) {
            await GM.deleteValue(key);
        }
        async has(key) {
            return await GM.listValues().then((values) => values.includes(key));
        }
        async clear() {
            await GM.listValues().then((values) => values.forEach((value) => this.remove(value)));
        }
        async keys() {
            return await GM.listValues();
        }
    }

    class GoogleAuth {
        workerUrl;
        storage = new MonkeyStorage();
        TOKEN_STORAGE_KEY = "googleTokenData";
        TOKEN_BUFFER = 5 * 60 * 1000;
        constructor(workerUrl) {
            this.workerUrl = workerUrl;
        }
        async loadStoredToken() {
            const stored = await this.storage.get(this.TOKEN_STORAGE_KEY);
            if (stored) {
                try {
                    return JSON.parse(stored);
                }
                catch (e) {
                    console.error("Error parseando token almacenado:", e);
                }
            }
            return null;
        }
        async saveToken(token, expiresIn = 3600) {
            const tokenData = {
                token: token,
                expiresAt: Date.now() + expiresIn * 1000,
            };
            await this.storage.set(this.TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
        }
        requestAccess() {
            window.open(`${this.workerUrl}/auth/start`, "LoginGoogle");
        }
        async refreshToken() {
            try {
                const res = await fetch(`${this.workerUrl}/refresh`);
                const data = await res.json();
                if (data.access_token) {
                    await this.saveToken(data.access_token, data.expires_in || 3600);
                    return data.access_token;
                }
            }
            catch (error) {
                console.error("Error while refreshing token:", error);
            }
            return null;
        }
        async getValidToken() {
            const stored = await this.loadStoredToken();
            if (stored && stored.expiresAt > Date.now() + this.TOKEN_BUFFER) {
                return stored.token;
            }
            return await this.refreshToken();
        }
    }

    const WORKER_URL = "https://google-auth.itla-plus.workers.dev";

    class ExportAssignments {
        name = "ExportAssignments";
        token;
        url = "https://aulavirtual.itla.edu.do/calendar/view.php?view=upcoming";
        storage = new MonkeyStorage();
        exported = [];
        constructor(token) {
            this.token = token;
        }
        shouldRun() {
            return !!this.token && DOM.isOnPage();
        }
        async init() {
            if (!this.token) {
                console.warn(`[${this.name}] Token unavailable, we cannot export assignments`);
                return;
            }
            const assignments = await this.getAssignments();
            let countEvents = 0;
            for (const a of assignments) {
                if (!(await this.isAlreadyExported(a.id))) {
                    const event = this.mapAssignmentToEvent(a);
                    if (event) {
                        await this.createCalendarEvent(this.token, event);
                        await this.markAsExported(a.id);
                        countEvents++;
                    }
                }
            }
            console.log(`[${this.name}] ${countEvents} events created`);
        }
        async getCalendar() {
            const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });
            if (!res.ok) {
                throw new Error(`Error while trying to get calendar list: ${await res.text()}`);
            }
            const data = await res.json();
            const calendar = data.items.find((c) => c.summary.includes("ITLA Plus"));
            return calendar ? calendar.id : "";
        }
        async getOrCreateCalendar(token) {
            let calendarId = await this.getCalendar();
            if (calendarId) {
                // console.info(`[${this.name}] Using existing calendar: ${calendarId}`);
                return calendarId;
            }
            const res = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    summary: "ITLA Plus - Asignaciones",
                    description: "Calendario automático con tareas de la plataforma ITLA",
                    timeZone: "America/Santo_Domingo",
                }),
            });
            if (!res.ok) {
                throw new Error(`Error while creating calendar: ${await res.text()}`);
            }
            const newCalendar = await res.json();
            calendarId = newCalendar.id;
            console.log(`[${this.name}] Calendar created succesfully: ${calendarId}`);
            return calendarId;
        }
        async getAssignments() {
            try {
                const data = await GM.xmlHttpRequest({ method: "GET", url: this.url });
                const parse = new DOMParser();
                const doc = parse.parseFromString(data.responseText, "text/html");
                const assignmentsList = Array.from(doc.querySelectorAll('.eventlist [data-type="event"]'));
                const assignments = this.serializeAssingments(assignmentsList);
                return assignments;
            }
            catch (err) {
                console.error(`[${this.name}] Something went wrong:`, err);
                return [];
            }
        }
        serializeAssingments(assignments) {
            return assignments.map((assignment) => {
                const dateLink = assignment.querySelector('a[href*="calendar/view.php?view=day&time="]');
                let date = null;
                if (dateLink) {
                    const url = new URL(dateLink.href);
                    const timeParam = url.searchParams.get("time");
                    if (timeParam) {
                        date = new Date(parseInt(timeParam, 10) * 1000);
                    }
                }
                const links = Array.from(assignment.querySelectorAll(".card-body a"));
                const lastLink = links[links.length - 1];
                return {
                    id: assignment.getAttribute("data-event-id"),
                    title: assignment.getAttribute("data-event-title"),
                    description: assignment.querySelector(".description-content")?.innerHTML ?? "",
                    courseId: assignment.getAttribute("data-course-id"),
                    courseName: lastLink ? lastLink.innerText : null,
                    date,
                    link: assignment.querySelector(".card-footer a")?.href ??
                        "",
                };
            });
        }
        mapAssignmentToEvent(a) {
            if (!a.date)
                return null;
            const dueDate = a.date;
            let startDate = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000);
            if (startDate < new Date()) {
                startDate = new Date();
            }
            return {
                summary: a.title || "Asignación sin título",
                description: `${a.courseName ?? ""}\n\n${a.description ?? ""}\n\nLink: ${a.link ?? ""}`,
                start: {
                    dateTime: startDate.toISOString(),
                    timeZone: "America/Santo_Domingo",
                },
                end: {
                    dateTime: dueDate.toISOString(),
                    timeZone: "America/Santo_Domingo",
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: "email", minutes: 48 * 60 },
                        { method: "popup", minutes: 60 * 2 },
                    ],
                },
            };
        }
        async createCalendarEvent(token, event) {
            const calendarId = await this.getOrCreateCalendar(token);
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(event),
            });
            if (!res.ok) {
                const error = await res.json();
                if (error.error?.code === 409) {
                    console.log(`[${this.name}] Duplicate event, already exist.`);
                }
                console.error(`[${this.name}] Error creating event:`, error);
            }
            else {
                console.log(`[${this.name}] Events created:`, await res.json());
            }
        }
        async isAlreadyExported(id) {
            this.exported = (await this.storage.get("exportedAssignments", [])) || [];
            return this.exported.includes(id);
        }
        async markAsExported(id) {
            this.exported = (await this.storage.get("exportedAssignments", [])) || [];
            this.exported.push(id);
            await this.storage.set("exportedAssignments", this.exported);
        }
    }

    class CoursePointsTracker {
        name = "CoursePointsTracker";
        url = "";
        static SUPPORTED_HOSTS = [
            "aulavirtual.itla.edu.do",
            "virtual.itsc.edu.do",
        ];
        shouldRun() {
            return CoursePointsTracker.SUPPORTED_HOSTS.some((host) => DOM.isOnPage(`https://${host}/course/view.php?id=*`));
        }
        async init() {
            const grades = await this.getGrades();
            this.createBoxComponent(grades, this.url);
        }
        async getGrades() {
            try {
                const url = await DOM.waitForElement('[data-key="grades"] a');
                if (!url) {
                    console.warn(`[${this.name}] No subject selected`);
                    return 0;
                }
                this.url = url.href;
                const data = await GM.xmlHttpRequest({ url: url.href });
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.responseText, "text/html");
                const rows = Array.from(doc.querySelectorAll(".user-grade tbody tr"));
                // Summing individual item grades ourselves breaks down as soon as a
                // course has weighted categories or items on different scales (0-3,
                // 0-10, 0-100, ...). Moodle already computes the real weighted total
                // on the "Acumulado Total" row ("courseitem"), so read that instead.
                const totalRow = rows.find((row) => row.querySelector(".column-itemname .courseitem"));
                if (!totalRow) {
                    console.warn(`[${this.name}] Could not find the course total row`);
                    return 0;
                }
                const percentageCell = totalRow.querySelector(".column-percentage");
                const percentageText = percentageCell?.innerText
                    .replace("%", "")
                    .trim()
                    .replace(",", ".");
                const percentage = percentageText ? parseFloat(percentageText) : NaN;
                return isNaN(percentage) ? 0 : Math.round(percentage);
            }
            catch (err) {
                console.error(`[${this.name}] Error getting table grades`, err);
                return 0;
            }
        }
        async createBoxComponent(accumGrade, url) {
            const div = document.createElement("div");
            div.id = "custom-container";
            div.innerHTML = `
        <p>
          Acumulado: <span id="custom-grade">0</span>
        </p>
    `;
            div.addEventListener("click", () => {
                window.location.href = url;
            });
            document.body.appendChild(div);
            const customGrade = await DOM.waitForElement("#custom-grade");
            if (customGrade) {
                this.animateCounter(customGrade, accumGrade);
                this.gradeStatus(customGrade, accumGrade);
                customGrade?.classList.remove("animate");
                void customGrade?.offsetWidth;
                customGrade?.classList.add("animate");
            }
        }
        animateCounter(element, total) {
            let current = 0;
            const increment = Math.ceil(total / 20);
            const interval = setInterval(() => {
                current += increment;
                if (current >= total) {
                    current = total;
                    clearInterval(interval);
                }
                element.innerText = String(current);
            }, 50);
        }
        gradeStatus(element, grade) {
            if (grade >= 80) {
                element.style.color = "green";
            }
            else if (grade >= 70) {
                element.style.color = "orange";
            }
            else {
                element.style.color = "red";
            }
        }
    }

    class Core {
        plugins = [];
        register(plugins) {
            this.plugins = plugins;
        }
        async init() {
            for (const plugin of this.plugins) {
                try {
                    if (plugin.shouldRun()) {
                        console.log(`[Core] Running plugin: ${plugin.name}`);
                        await plugin.init();
                    }
                }
                catch (error) {
                    console.error(`[Core] Error in plugin ${plugin.name}:`, error);
                }
            }
        }
    }

    class UI {
        static instances = new Map();
        static render(component) {
            const existing = this.instances.get(component.id);
            if (!existing) {
                component.mount();
                this.instances.set(component.id, component);
            }
            else {
                existing.update();
            }
        }
        static unmount(id) {
            const comp = this.instances.get(id);
            if (comp) {
                comp.unmount();
                this.instances.delete(id);
            }
        }
        static toggle(component) {
            const existing = this.instances.get(component.id);
            if (existing) {
                this.unmount(component.id);
            }
            else {
                this.render(component);
            }
        }
    }

    class UIComponent {
        id;
        root = null;
        constructor(id) {
            this.id = id;
        }
        mount() {
            if (!this.root) {
                this.root = this.render();
                this.root.id = this.id;
                document.body.appendChild(this.root);
                this.onMount(this.root);
            }
            // return this.root;
        }
        update() {
            if (!this.root)
                return;
            const newNode = this.render();
            this.root.replaceWith(newNode);
            this.root = newNode;
            this.onUpdate();
        }
        unmount() {
            if (this.root) {
                this.onUnmount();
                this.root.remove();
                this.root = null;
            }
        }
        async onMount(root) { }
        onUpdate() { }
        onUnmount() { }
    }

    class SettingsModal extends UIComponent {
        googleAuth;
        storage;
        constructor(auth, storage) {
            super("settingsModal");
            this.googleAuth = auth;
            this.storage = storage;
        }
        render() {
            const modalOverlay = document.createElement("div");
            modalOverlay.id = `${this.id}-modal`;
            modalOverlay.className = "custom-modal-overlay active";
            modalOverlay.innerHTML = `
    <div class="custom-modal">
      <div class="custom-modal-header">
        <h2 class="custom-modal-title">Configuración</h2>
        <button class="custom-close-button" id="closeBtn">&times;</button>
      </div>
      <div class="custom-modal-content">
        <div class="custom-section">
          <h3 class="custom-section-title">Integraciones</h3>
          <div class="custom-integration-card">
            <div class="custom-new-badge">
              <span>new</span>
            </div>
            <div class="custom-integration-header">
              <div class="custom-integration-logo">
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" alt="Google Calendar">
              </div>
              <div class="custom-integration-info">
                <div class="custom-integration-name">Google Calendar</div>
                <div class="custom-integration-description">Sincroniza tus asignaciones</div>
              </div>
              <div id="statusBadge" class="custom-status-badge custom-hidden">
                <span class="custom-status-dot"></span> Conectado
              </div>
            </div>
            <div class="custom-integration-actions">
              <button id="connectBtn" class="custom-btn custom-btn-primary">Conectar con Google</button>
              <button id="disconnectBtn" class="custom-btn custom-btn-danger custom-hidden">Cerrar sesión</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
            modalOverlay.querySelector("#closeBtn")?.addEventListener("click", () => {
                UI.unmount(this.id);
            });
            modalOverlay.querySelector("#connectBtn")?.addEventListener("click", () => {
                this.connectToGoogle(modalOverlay);
            });
            modalOverlay
                .querySelector("#disconnectBtn")
                ?.addEventListener("click", () => {
                this.disconnectFromGoogle(modalOverlay);
            });
            return modalOverlay;
        }
        async onMount(root) {
            const storedToken = await this.storage.get("googleTokenData");
            if (storedToken) {
                this.toggleConnection(root, true);
            }
            else {
                this.toggleConnection(root, false);
            }
        }
        async toggleConnection(root, connected) {
            const connectBtn = root.querySelector("#connectBtn");
            const disconnectBtn = root.querySelector("#disconnectBtn");
            const statusBadge = root.querySelector("#statusBadge");
            const newBadge = root.querySelector(".custom-new-badge");
            if (connected) {
                connectBtn?.classList.add("custom-hidden");
                disconnectBtn?.classList.remove("custom-hidden");
                statusBadge?.classList.remove("custom-hidden");
                newBadge?.classList.add("custom-hidden");
            }
            else {
                connectBtn?.classList.remove("custom-hidden");
                disconnectBtn?.classList.add("custom-hidden");
                statusBadge?.classList.add("custom-hidden");
                newBadge?.classList.remove("custom-hidden");
            }
        }
        connectToGoogle(root) {
            this.googleAuth.requestAccess();
            const handler = async (event) => {
                if (event.origin.includes("workers.dev")) {
                    const tokens = event.data;
                    await this.storage.set("googleTokenData", tokens);
                    this.toggleConnection(root, true);
                    window.removeEventListener("message", handler);
                }
            };
            window.addEventListener("message", handler);
        }
        async disconnectFromGoogle(root) {
            await this.storage.remove("googleTokenData");
            this.toggleConnection(root, false);
        }
    }

    const mStorage = new MonkeyStorage();
    const auth = new GoogleAuth(WORKER_URL);
    const style = GM_getResourceText("INTERNAL_CSS");
    GM_addStyle(style);
    GM_registerMenuCommand("⚙️ Configuración ITLA Plus", () => {
        const modal = new SettingsModal(auth, mStorage);
        modal.mount();
        UI.toggle(modal);
    });
    (async () => {
        const existingToken = await mStorage.get("googleTokenData");
        let token = existingToken ? await auth.getValidToken() : null;
        if (token) {
            setInterval(async () => {
                token = await auth.getValidToken();
            }, 50 * 60 * 1000);
        }
        const core = new Core();
        core.register([new CoursePointsTracker(), new ExportAssignments(token)]);
        await core.init();
    })();

})();
//# sourceMappingURL=itla-plus.user.js.map
