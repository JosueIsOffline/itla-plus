// ==UserScript==
// @name         ITLA Plus Dev
// @namespace    https://github.com/JosueIsOffline
// @version      1.2.0-beta
// @description  Suite modular de herramientas para mejorar la experiencia en la plataforma virtual del ITLA.
// @author       JosueIsOffline
// @match        https://aulavirtual.itla.edu.do/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @resource     INTERNAL_CSS https://raw.githubusercontent.com/JosueIsOffline/itla-plus/main/src/styles.css
// @updateURL    https://github.com/JosueIsOffline/itla-plus/releases/latest/download/itla-plus.user.js
// @downloadURL  https://github.com/JosueIsOffline/itla-plus/releases/latest/download/itla-plus.user.js
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    class Crypto {
        static encrypt(text, key) {
            return CryptoJS.AES.encrypt(text, key).toString();
        }
        static decrypt(ciphertext, key) {
            const bytes = CryptoJS.AES.decrypt(ciphertext, key);
            return bytes.toString(CryptoJS.enc.Utf8);
        }
        static hash(text) {
            return CryptoJS.SHA256(text).toString();
        }
    }

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

    const STORAGE_USER = "itlaUser";
    const STORAGE_PASS = "itlaPass";
    const WORKER_URL = "https://google-auth.itla-plus.workers.dev";
    const SVG = {
        TRASH: `<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24">
	<g fill="none" stroke="#df0b0b" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
		<path stroke-dasharray="24" stroke-dashoffset="24" d="M12 20h5c0.5 0 1 -0.5 1 -1v-14M12 20h-5c-0.5 0 -1 -0.5 -1 -1v-14">
			<animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="24;0" />
		</path>
		<path stroke-dasharray="20" stroke-dashoffset="20" d="M4 5h16">
			<animate fill="freeze" attributeName="stroke-dashoffset" begin="0.4s" dur="0.2s" values="20;0" />
		</path>
		<path stroke-dasharray="8" stroke-dashoffset="8" d="M10 4h4M10 9v7M14 9v7">
			<animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" values="8;0" />
		</path>
	</g>
</svg>`,
    };

    async function getOrCreateKey() {
        const storage = new MonkeyStorage();
        let encryptionKey = await storage.get("encryptionKey");
        if (!encryptionKey) {
            let deviceFingerPrint = navigator.userAgent + navigator.language + screen.width + screen.height;
            encryptionKey = Crypto.hash(deviceFingerPrint);
            await storage.set("encryptionKey", encryptionKey);
            return encryptionKey;
        }
        return encryptionKey;
    }

    class AutoLogin {
        name = "AutoLogin";
        storage = new MonkeyStorage();
        shouldRun() {
            return DOM.isOnPage("https://aulavirtual.itla.edu.do/login/*");
        }
        async init() {
            const creds = await this.asycAskCredentials();
            if (creds) {
                this.login(creds);
            }
        }
        async asycAskCredentials() {
            let user = await this.storage.get(STORAGE_USER);
            let pass = await this.storage.get(STORAGE_PASS);
            const ENCRYPTION_KEY = await getOrCreateKey();
            if (user && pass) {
                user = Crypto.decrypt(user, ENCRYPTION_KEY);
                pass = Crypto.decrypt(pass, ENCRYPTION_KEY);
                if (!user || !pass || user.length < 8) {
                    user = null;
                    pass = null;
                }
            }
            if (!user || !pass) {
                user = prompt("Ingresa tu matrícula del ITLA:");
                pass = prompt("Ingresa tu contraseña:");
                if (user && pass) {
                    const encryptedUser = Crypto.encrypt(user, ENCRYPTION_KEY);
                    const encryptedPass = Crypto.encrypt(pass, ENCRYPTION_KEY);
                    await this.storage.set(STORAGE_USER, encryptedUser);
                    await this.storage.set(STORAGE_PASS, encryptedPass);
                }
                else {
                    alert("Debes ingresar ambos campos. Recarga para intentar de nuevo.");
                    return null;
                }
            }
            return {
                user,
                pass,
            };
        }
        login({ user, pass }) {
            if (!user || !pass) {
                console.error("Username or password wans't provide");
                return;
            }
            const userInput = DOM.getInput("username");
            const passInput = DOM.getInput("password");
            const loginBtn = DOM.getButton("loginbtn");
            if (userInput && passInput && loginBtn) {
                DOM.fillInput(userInput, user);
                DOM.fillInput(passInput, pass);
                setTimeout(() => {
                    loginBtn.click();
                }, 200);
            }
        }
    }

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
        shouldRun() {
            return DOM.isOnPage("https://aulavirtual.itla.edu.do/course/view.php?id=*");
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
                const grades = Array.from(doc.querySelectorAll(".user-grade .column-grade"));
                let total = 0;
                for (let grade of grades) {
                    const gradeText = grade.innerText.trim().replace(',', '.');
                    const absoluteGrade = parseFloat(gradeText);
                    if (!isNaN(absoluteGrade) && absoluteGrade <= 20) {
                        total += absoluteGrade;
                    }
                }
                return Math.round(total);
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
          <h3 class="custom-section-title">Opciones</h3>
          <div class="custom-option-section">
            <p>Borrar credenciales guardadas</p>
            <button id="deleteBtn" class="custom-close-button custom-btn-danger">
              ${SVG.TRASH}
            </button>
          </div>
        </div>

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
            modalOverlay
                .querySelector("#deleteBtn")
                ?.addEventListener("click", async () => {
                await this.deleteCredentials();
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
        async deleteCredentials() {
            await this.storage.set(STORAGE_USER, null);
            await this.storage.set(STORAGE_PASS, null);
            alert("Credenciales borradas. Recarga la página para ingresar nuevas.");
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
        core.register([
            new AutoLogin(),
            new CoursePointsTracker(),
            new ExportAssignments(token),
        ]);
        await core.init();
    })();

})();
//# sourceMappingURL=itla-plus.user.js.map
