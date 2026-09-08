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

      let total = 0;
      for (const row of rows) {
        // Moodle marks real gradable rows with "item"; category subtotals
        // ("categoryitem") and the course grand total ("courseitem") reuse
        // .column-grade too, so summing everything double-counts totals.
        if (!row.querySelector(".column-itemname .item")) continue;

        const gradeCell = row.querySelector<HTMLTableCellElement>(".column-grade");
        if (!gradeCell) continue;

        const gradeText = gradeCell.innerText.trim().replace(",", ".");
        const absoluteGrade = parseFloat(gradeText);

        if (!isNaN(absoluteGrade)) {
          total += absoluteGrade;
        }
      }

      return Math.round(total);
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
