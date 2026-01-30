import { Plugin } from "../../core/plugin";
import { getOrCreateKey } from "../../utils/key-handler";
import { MonkeyStorage } from "../services";
import { Crypto, DOM } from "../services";
import { STORAGE_PASS, STORAGE_USER } from "../shared/constants";

export class AutoLogin implements Plugin {
  name = "AutoLogin";
  private storage = new MonkeyStorage();

  shouldRun(): boolean {
    return DOM.isOnPage("https://aulavirtual.itla.edu.do/login/*");
  }

  async init(): Promise<void> {
    const creds = await this.asycAskCredentials();
    if (creds) {
      this.login(creds);
    }
  }

  private async asycAskCredentials(): Promise<Record<string, string> | null> {
    let user = await this.storage.get<string>(STORAGE_USER);
    let pass = await this.storage.get<string>(STORAGE_PASS);
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

        await this.storage.set<string>(STORAGE_USER, encryptedUser);
        await this.storage.set<string>(STORAGE_PASS, encryptedPass);
      } else {
        alert("Debes ingresar ambos campos. Recarga para intentar de nuevo.");
        return null;
      }
    }

    return {
      user,
      pass,
    };
  }

  private login({ user, pass }: Record<string, string>) {
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
