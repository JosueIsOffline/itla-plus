import { TokenData } from "../../types/google";
import { GoogleAuth, MonkeyStorage } from "../services";
import { UI } from "./ui";
import { UIComponent } from "./ui-component";

export class SettingsModal extends UIComponent {
  private googleAuth: GoogleAuth;
  private storage: MonkeyStorage;

  constructor(auth: GoogleAuth, storage: MonkeyStorage) {
    super("settingsModal");
    this.googleAuth = auth;
    this.storage = storage;
  }

  render(): HTMLElement {
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

  protected async onMount(root: HTMLElement): Promise<void> {
    const storedToken = await this.storage.get<TokenData>("googleTokenData");

    if (storedToken) {
      this.toggleConnection(root, true);
    } else {
      this.toggleConnection(root, false);
    }
  }

  private async toggleConnection(
    root: HTMLElement,
    connected: Boolean,
  ): Promise<void> {
    const connectBtn = root.querySelector("#connectBtn");
    const disconnectBtn = root.querySelector("#disconnectBtn");
    const statusBadge = root.querySelector("#statusBadge");
    const newBadge = root.querySelector(".custom-new-badge");

    if (connected) {
      connectBtn?.classList.add("custom-hidden");
      disconnectBtn?.classList.remove("custom-hidden");
      statusBadge?.classList.remove("custom-hidden");
      newBadge?.classList.add("custom-hidden");
    } else {
      connectBtn?.classList.remove("custom-hidden");
      disconnectBtn?.classList.add("custom-hidden");
      statusBadge?.classList.add("custom-hidden");
      newBadge?.classList.remove("custom-hidden");
    }
  }

  private connectToGoogle(root: HTMLElement): void {
    this.googleAuth.requestAccess();
    const handler = async (event: MessageEvent) => {
      if (event.origin.includes("workers.dev")) {
        const tokens = event.data;
        await this.storage.set("googleTokenData", tokens);
        this.toggleConnection(root, true);
        window.removeEventListener("message", handler);
      }
    };
    window.addEventListener("message", handler);
  }

  private async disconnectFromGoogle(root: HTMLElement): Promise<void> {
    await this.storage.remove("googleTokenData");
    this.toggleConnection(root, false);
  }
}
