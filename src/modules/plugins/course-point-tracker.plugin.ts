import { Url } from "url";
import { Plugin } from "../../core/plugin";
import { DOM } from "../services";

export class CoursePointsTracker implements Plugin {
  name = "CoursePointsTracker";
  private url: string = "";

  private static readonly SUPPORTED_HOSTS = [
    "aulavirtual.itla.edu.do",
    "virtual.itsc.edu.do",
  ];

  shouldRun(): boolean {
    return CoursePointsTracker.SUPPORTED_HOSTS.some((host) =>
      DOM.isOnPage(`https://${host}/course/view.php?id=*`),
    );
  }

  async init(): Promise<void> {
    const grades = await this.getGrades();
    this.createBoxComponent(grades, this.url);
  }

  private async getGrades(): Promise<number> {
    try {
      const url = await DOM.waitForElement<HTMLAnchorElement>(
        '[data-key="grades"] a'
      );

      if (!url) {
        console.warn(`[${this.name}] No subject selected`);
        return 0;
      }

      this.url = url.href;
      const data = await GM.xmlHttpRequest({ url: url.href });
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.responseText, "text/html");

      const rows = Array.from(
        doc.querySelectorAll<HTMLTableRowElement>(".user-grade tbody tr"),
      );

      // Summing individual item grades ourselves breaks down as soon as a
      // course has weighted categories or items on different scales (0-3,
      // 0-10, 0-100, ...). Moodle already computes the real weighted total
      // on the "Acumulado Total" row ("courseitem"), so read that instead.
      const totalRow = rows.find((row) =>
        row.querySelector(".column-itemname .courseitem"),
      );

      if (!totalRow) {
        console.warn(`[${this.name}] Could not find the course total row`);
        return 0;
      }

      const percentageCell = totalRow.querySelector<HTMLTableCellElement>(
        ".column-percentage",
      );
      const percentageText = percentageCell?.innerText
        .replace("%", "")
        .trim()
        .replace(",", ".");
      const percentage = percentageText ? parseFloat(percentageText) : NaN;

      return isNaN(percentage) ? 0 : Math.round(percentage);
    } catch (err) {
      console.error(`[${this.name}] Error getting table grades`, err);
      return 0;
    }
  }

  private async createBoxComponent(
    accumGrade: number,
    url: string,
  ): Promise<void> {
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

    const customGrade =
      await DOM.waitForElement<HTMLSpanElement>("#custom-grade");

    if (customGrade) {
      this.animateCounter(customGrade, accumGrade);
      this.gradeStatus(customGrade, accumGrade);

      customGrade?.classList.remove("animate");
      void customGrade?.offsetWidth;
      customGrade?.classList.add("animate");
    }
  }

  private animateCounter(element: HTMLElement, total: number) {
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

  private gradeStatus(element: HTMLElement, grade: number) {
    if (grade >= 80) {
      element.style.color = "green";
    } else if (grade >= 70) {
      element.style.color = "orange";
    } else {
      element.style.color = "red";
    }
  }
}
