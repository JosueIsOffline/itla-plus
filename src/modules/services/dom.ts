export class DOM {
  public static async waitForElement<T extends Element>(
    selector: string,
    timeout: number = 5000,
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const element = document.querySelector<T>(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector<T>(selector);
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

  public static async waitForElements(
    selectors: string[],
    timeout: number = 5000,
  ): Promise<(Element | null)[]> {
    return Promise.all(
      selectors.map((selector) => this.waitForElement(selector, timeout)),
    );
  }

  public static fillInput(input: HTMLInputElement, value: string): void {
    input.value = value;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  public static safeClick(element: HTMLElement): void {
    if (typeof element.click === "function") {
      element.click();
    } else {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      element.dispatchEvent(event);
    }
  }

  public static getInput(identifier: string): HTMLInputElement | null {
    let input = document.querySelector<HTMLInputElement>(
      `input[name="${identifier}"]`,
    );

    if (!input) {
      input = document.querySelector<HTMLInputElement>(`#${identifier}`);
    }

    if (!input) {
      input = document.querySelector<HTMLInputElement>(identifier);
    }

    return input;
  }

  public static getButton(identifier: string): HTMLButtonElement | null {
    let button = document.querySelector<HTMLButtonElement>(`#${identifier}`);

    if (!button) {
      button = document.querySelector<HTMLButtonElement>(identifier);
    }

    if (!button) {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      );

      button =
        buttons.find((btn: HTMLButtonElement) =>
          btn.textContent
            ?.trim()
            .toLowerCase()
            .includes(identifier.toLowerCase()),
        ) || null;
    }

    return button;
  }

  public static isOnPage(
    urlPattern: string = "https://aulavirtual.itla.edu.do/",
  ): boolean {
    const pattern = urlPattern.replace(/\*/g, ".*").replace(/\?/g, "\\?");
    const regex = new RegExp(pattern);

    return regex.test(window.location.href);
  }

  public static onDOMReady(callback: () => void): void {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  public static observerElemnt(
    element: Element,
    callback: (mutations: MutationRecord[]) => void,
    options: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
    },
  ): MutationObserver {
    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    return observer;
  }
}
