import { Plugin } from "../../core/plugin";
import { Assignment } from "../../types/assingment";
import { DOM, MonkeyStorage } from "../services";

export class ExportAssignments implements Plugin {
  name = "ExportAssignments";
  private token: string | null;
  private url: string =
    "https://aulavirtual.itla.edu.do/calendar/view.php?view=upcoming";
  private storage: MonkeyStorage = new MonkeyStorage();
  private exported: string[] = [];

  constructor(token: string | null) {
    this.token = token;
  }

  shouldRun(): boolean {
    return !!this.token && DOM.isOnPage();
  }

  async init(): Promise<void> {
    if (!this.token) {
      console.warn(
        `[${this.name}] Token unavailable, we cannot export assignments`,
      );
      return;
    }

    const assignments = await this.getAssignments();

    let countEvents = 0;
    for (const a of assignments) {
      if (!(await this.isAlreadyExported(a.id!))) {
        const event = this.mapAssignmentToEvent(a);
        if (event) {
          await this.createCalendarEvent(this.token, event);
          await this.markAsExported(a.id!);
          countEvents++;
        }
      }
    }

    console.log(`[${this.name}] ${countEvents} events created`);
  }

  private async getCalendar(): Promise<string> {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Error while trying to get calendar list: ${await res.text()}`,
      );
    }

    const data = await res.json();
    const calendar = data.items.find((c: any) =>
      c.summary.includes("ITLA Plus"),
    );

    return calendar ? calendar.id : "";
  }

  private async getOrCreateCalendar(token: string): Promise<string> {
    let calendarId = await this.getCalendar();
    if (calendarId) {
      // console.info(`[${this.name}] Using existing calendar: ${calendarId}`);
      return calendarId;
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      {
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
      },
    );

    if (!res.ok) {
      throw new Error(`Error while creating calendar: ${await res.text()}`);
    }

    const newCalendar = await res.json();
    calendarId = newCalendar.id;

    console.log(`[${this.name}] Calendar created succesfully: ${calendarId}`);

    return calendarId;
  }

  private async getAssignments(): Promise<Assignment[]> {
    try {
      const data = await GM.xmlHttpRequest({ method: "GET", url: this.url });
      const parse = new DOMParser();
      const doc = parse.parseFromString(data.responseText, "text/html");

      const assignmentsList = Array.from(
        doc.querySelectorAll<HTMLDivElement>('.eventlist [data-type="event"]'),
      );

      const assignments = this.serializeAssingments(assignmentsList);

      return assignments;
    } catch (err) {
      console.error(`[${this.name}] Something went wrong:`, err);
      return [];
    }
  }

  private serializeAssingments(assignments: HTMLDivElement[]): Assignment[] {
    return assignments.map((assignment) => {
      const dateLink: HTMLAnchorElement | null = assignment.querySelector(
        'a[href*="calendar/view.php?view=day&time="]',
      );

      let date: Date | null = null;

      if (dateLink) {
        const url = new URL(dateLink.href);
        const timeParam: string | null = url.searchParams.get("time");
        if (timeParam) {
          date = new Date(parseInt(timeParam, 10) * 1000);
        }
      }

      const links: HTMLAnchorElement[] = Array.from(
        assignment.querySelectorAll(".card-body a"),
      );
      const lastLink: HTMLAnchorElement | undefined = links[links.length - 1];

      return {
        id: assignment.getAttribute("data-event-id"),
        title: assignment.getAttribute("data-event-title"),
        description:
          assignment.querySelector(".description-content")?.innerHTML ?? "",
        courseId: assignment.getAttribute("data-course-id"),
        courseName: lastLink ? lastLink.innerText : null,
        date,
        link:
          assignment.querySelector<HTMLAnchorElement>(".card-footer a")?.href ??
          "",
      } as Assignment;
    });
  }

  private mapAssignmentToEvent(a: Assignment): Object | null {
    if (!a.date) return null;
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

  private async createCalendarEvent(token: string, event: any) {
    const calendarId = await this.getOrCreateCalendar(token);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );

    if (!res.ok) {
      const error = await res.json();
      if (error.error?.code === 409) {
        console.log(`[${this.name}] Duplicate event, already exist.`);
      }
      console.error(`[${this.name}] Error creating event:`, error);
    } else {
      console.log(`[${this.name}] Events created:`, await res.json());
    }
  }

  private async isAlreadyExported(id: string): Promise<boolean> {
    this.exported = (await this.storage.get("exportedAssignments", [])) || [];
    return this.exported.includes(id);
  }

  private async markAsExported(id: string): Promise<void> {
    this.exported = (await this.storage.get("exportedAssignments", [])) || [];
    this.exported.push(id);
    await this.storage.set("exportedAssignments", this.exported);
  }
}
