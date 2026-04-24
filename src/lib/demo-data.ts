import { boardDefinitions, boardStatuses, slugify, type BoardSlug, type TaskStatus } from "./domain";

type DemoSubtaskSeed = {
  title: string;
  isComplete?: boolean;
};

type DemoTaskSeed = {
  title: string;
  description?: string;
  status: TaskStatus;
  dueInDays?: number;
  completedDaysAgo?: number;
  archivedDaysAgo?: number;
  subtasks?: DemoSubtaskSeed[];
};

type DemoBoardSeed = {
  slug: BoardSlug;
  noteLines: string[];
  tasks: DemoTaskSeed[];
};

function createTask(status: TaskStatus, title: string, options: Omit<DemoTaskSeed, "status" | "title"> = {}): DemoTaskSeed {
  return {
    status,
    title,
    ...options,
  };
}

const personalBoard: DemoBoardSeed = {
  slug: "personal",
  noteLines: [
    "Move work left.",
    "Limit WIP.",
    "Visualize flow.",
    "Improve continuously.",
  ],
  tasks: [
    createTask("ICE_BOX", "Learn Spanish"),
    createTask("ICE_BOX", "Build side project idea"),
    createTask("ICE_BOX", "Read 12 books this year"),
    createTask("ICE_BOX", "Run a half marathon"),
    createTask("ICE_BOX", "Organize photos & videos"),
    createTask("ON_DECK", "Plan weekend trip", {
      dueInDays: 10,
      subtasks: [
        { title: "Pick a city", isComplete: true },
        { title: "Book the hotel" },
        { title: "Send itinerary to friends" },
      ],
    }),
    createTask("ON_DECK", "Buy new running shoes", {
      dueInDays: 5,
      subtasks: [
        { title: "Compare two brands", isComplete: true },
        { title: "Try on in-store" },
      ],
    }),
    createTask("ON_DECK", "Meal prep for the week", {
      dueInDays: 2,
      subtasks: [
        { title: "Choose recipes" },
        { title: "Order groceries" },
      ],
    }),
    createTask("ON_DECK", "Finish online course"),
    createTask("ON_DECK", "Call mom this weekend"),
    createTask("IN_PROGRESS", "Write blog post", {
      description: "A practical write-up on setting up a reliable weekly planning ritual.",
      dueInDays: 1,
      subtasks: [
        { title: "Draft outline", isComplete: true },
        { title: "Write introduction" },
        { title: "Add final screenshots" },
      ],
    }),
    createTask("IN_PROGRESS", "Redesign personal website", {
      description: "Refresh the homepage, tighten the case studies, and improve mobile spacing.",
      dueInDays: 7,
      subtasks: [
        { title: "Update hero copy", isComplete: true },
        { title: "Refine mobile nav" },
        { title: "QA project pages" },
      ],
    }),
    createTask("IN_PROGRESS", "Strength training 3x/week", {
      subtasks: [
        { title: "Monday lift", isComplete: true },
        { title: "Wednesday lift" },
        { title: "Friday lift" },
      ],
    }),
    createTask("IN_PROGRESS", "Research new laptop"),
    createTask("IN_PROGRESS", "Prep for team meeting", {
      subtasks: [
        { title: "Review agenda", isComplete: true },
        { title: "Write talking points" },
        { title: "Draft follow-up notes" },
      ],
    }),
    createTask("DONE", "Grocery shopping", {
      completedDaysAgo: 1,
      subtasks: [
        { title: "Buy produce", isComplete: true },
        { title: "Restock pantry", isComplete: true },
      ],
    }),
    createTask("DONE", "Dentist appointment", { completedDaysAgo: 3 }),
    createTask("DONE", "Pay credit card bill", { completedDaysAgo: 2 }),
    createTask("DONE", "Declutter closet", { completedDaysAgo: 6 }),
    createTask("DONE", "Oil change", { completedDaysAgo: 9 }),
    createTask("ARCHIVED", "2023 Tax Return", { archivedDaysAgo: 30 }),
    createTask("ARCHIVED", "Old project ideas", { archivedDaysAgo: 45 }),
    createTask("ARCHIVED", "Completed courses", { archivedDaysAgo: 60 }),
    createTask("ARCHIVED", "Past travel itineraries", { archivedDaysAgo: 90 }),
    createTask("ARCHIVED", "Sold old furniture", { archivedDaysAgo: 18 }),
  ],
};

const brightlineLabsBoard: DemoBoardSeed = {
  slug: "brightline-labs",
  noteLines: [
    "Tighten launch cadence.",
    "Keep docs current.",
    "Reduce handoff friction.",
    "Track the right signals.",
  ],
  tasks: [
    createTask("ICE_BOX", "Explore partner channel"),
    createTask("ICE_BOX", "Prototype client portal"),
    createTask("ICE_BOX", "Evaluate analytics vendor"),
    createTask("ICE_BOX", "Draft Q4 innovation themes"),
    createTask("ON_DECK", "Finalize homepage copy", {
      dueInDays: 4,
      subtasks: [
        { title: "Revise hero line", isComplete: true },
        { title: "Confirm proof points" },
        { title: "Share final draft" },
      ],
    }),
    createTask("ON_DECK", "Prepare investor update"),
    createTask("ON_DECK", "Review hiring scorecards"),
    createTask("ON_DECK", "Scope customer interview wave"),
    createTask("IN_PROGRESS", "Ship pricing page refresh", {
      description: "Align the pricing story with the latest plan structure and conversion notes.",
      dueInDays: 3,
      subtasks: [
        { title: "Finalize card copy", isComplete: true },
        { title: "Polish FAQ layout" },
        { title: "Run visual QA" },
      ],
    }),
    createTask("IN_PROGRESS", "Build campaign tracker"),
    createTask("IN_PROGRESS", "Write launch brief"),
    createTask("IN_PROGRESS", "Audit content library"),
    createTask("DONE", "Close beta feedback loop", { completedDaysAgo: 2 }),
    createTask("DONE", "Publish case study", { completedDaysAgo: 5 }),
    createTask("DONE", "Send partner invoices", { completedDaysAgo: 8 }),
    createTask("DONE", "Update sales deck", { completedDaysAgo: 4 }),
    createTask("ARCHIVED", "2025 planning notes", { archivedDaysAgo: 21 }),
    createTask("ARCHIVED", "Retired webinar outline", { archivedDaysAgo: 33 }),
    createTask("ARCHIVED", "Old ad experiments", { archivedDaysAgo: 56 }),
    createTask("ARCHIVED", "Archived partner list", { archivedDaysAgo: 70 }),
  ],
};

const elevatedOrganicsBoard: DemoBoardSeed = {
  slug: "elevated-organics",
  noteLines: [
    "Protect launch quality.",
    "Streamline vendor ops.",
    "Keep retail stories crisp.",
    "Close the loop quickly.",
  ],
  tasks: [
    createTask("ICE_BOX", "Test seasonal SKU concepts"),
    createTask("ICE_BOX", "Research event partnerships"),
    createTask("ICE_BOX", "Outline farm-tour playbook"),
    createTask("ON_DECK", "Prep vendor renegotiation"),
    createTask("ON_DECK", "Organize sample inventory"),
    createTask("ON_DECK", "Draft education series"),
    createTask("IN_PROGRESS", "Refresh product labels", {
      description: "Bring all primary packaging into the latest compliance and retail-ready standard.",
      dueInDays: 6,
      subtasks: [
        { title: "Update ingredient block", isComplete: true },
        { title: "Review print proof" },
        { title: "Lock retail barcode" },
      ],
    }),
    createTask("IN_PROGRESS", "Coordinate Earth Day event"),
    createTask("IN_PROGRESS", "Update DTC fulfillment SOP"),
    createTask("DONE", "Submit vendor forms", { completedDaysAgo: 1 }),
    createTask("DONE", "Approve invoice batch", { completedDaysAgo: 6 }),
    createTask("DONE", "Clean greenhouse notes", { completedDaysAgo: 11 }),
    createTask("ARCHIVED", "Past harvest recap", { archivedDaysAgo: 28 }),
    createTask("ARCHIVED", "2024 expo leads", { archivedDaysAgo: 40 }),
    createTask("ARCHIVED", "Closed tasting requests", { archivedDaysAgo: 64 }),
  ],
};

export const demoBoardSeeds = [personalBoard, brightlineLabsBoard, elevatedOrganicsBoard];

export function expandDemoSeed() {
  return demoBoardSeeds.map((board, boardIndex) => {
    const metadata = boardDefinitions.find((item) => item.slug === board.slug);

    if (!metadata) {
      throw new Error(`Missing board metadata for ${board.slug}`);
    }

    return {
      id: `board_${board.slug}`,
      slug: board.slug,
      name: metadata.name,
      iconKey: metadata.iconKey,
      description: metadata.description,
      sortOrder: boardIndex,
      noteContent: board.noteLines.map((line) => `• ${line}`).join("\n"),
      tasks: board.tasks.map((task, taskIndex) => {
        const taskId = `task_${board.slug}_${slugify(task.title)}`;

        return {
          id: taskId,
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          dueInDays: task.dueInDays ?? null,
          completedDaysAgo: task.completedDaysAgo ?? null,
          archivedDaysAgo: task.archivedDaysAgo ?? null,
          sortOrder:
            boardStatuses.findIndex((status) => status === task.status) * 100 + taskIndex,
          subtasks:
            task.subtasks?.map((subtask, subtaskIndex) => ({
              id: `subtask_${taskId}_${subtaskIndex + 1}`,
              title: subtask.title,
              isComplete: Boolean(subtask.isComplete),
              sortOrder: subtaskIndex,
            })) ?? [],
        };
      }),
    };
  });
}
