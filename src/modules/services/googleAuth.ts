import { TokenData } from "../../types/google";
import { MonkeyStorage } from "./monkey-storage";

export class GoogleAuth {
  private workerUrl: string;
  private storage: MonkeyStorage = new MonkeyStorage();
  private readonly TOKEN_STORAGE_KEY = "googleTokenData";
  private readonly TOKEN_BUFFER = 5 * 60 * 1000;

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl;
  }

  private async loadStoredToken(): Promise<TokenData | null> {
    const stored = await this.storage.get<string>(this.TOKEN_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as TokenData;
      } catch (e) {
        console.error("Error parseando token almacenado:", e);
      }
    }
    return null;
  }

  private async saveToken(token: string, expiresIn = 3600): Promise<void> {
    const tokenData: TokenData = {
      token: token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await this.storage.set(this.TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
  }

  public requestAccess(): void {
    window.open(`${this.workerUrl}/auth/start`, "LoginGoogle");
  }

  public async saveTokenFromAuthMessage(data: {
    access_token: string;
    expires_in?: number;
  }): Promise<void> {
    await this.saveToken(data.access_token, data.expires_in);
  }

  private async refreshToken(): Promise<string | null> {
    try {
      const res = await fetch(`${this.workerUrl}/refresh`);
      const data = await res.json();
      if (data.access_token) {
        await this.saveToken(data.access_token, data.expires_in || 3600);
        return data.access_token;
      }
    } catch (error) {
      console.error("Error while refreshing token:", error);
    }
    return null;
  }

  public async getValidToken(): Promise<string | null> {
    const stored = await this.loadStoredToken();

    if (stored && stored.expiresAt > Date.now() + this.TOKEN_BUFFER) {
      return stored.token;
    }

    return await this.refreshToken();
  }
}
