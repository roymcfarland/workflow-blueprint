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

const bagEndBoard: DemoBoardSeed = {
  slug: "bag-end",
  noteLines: [
    "Keep the pantry full.",
    "Mind the Sackville-Bagginses.",
    "No adventures before tea.",
    "A hobbit-hole means comfort.",
  ],
  tasks: [
    createTask("ICE_BOX", "Plant an oak by the front gate"),
    createTask("ICE_BOX", "Learn the Old Took's smoke-ring trick"),
    createTask("ICE_BOX", "Map the tunnels under the Hill"),
    createTask("ICE_BOX", "Restore Grandfather's old map case"),
    createTask("ON_DECK", "Host the Gaffer for afternoon tea", {
      dueInDays: 3,
      subtasks: [
        { title: "Bake a seed-cake", isComplete: true },
        { title: "Brew the good Longbottom Leaf tea" },
        { title: "Tidy the parlour" },
      ],
    }),
    createTask("ON_DECK", "Restock the pantry", {
      dueInDays: 2,
      subtasks: [
        { title: "Cheese and pickles" },
        { title: "Ale from the Green Dragon" },
        { title: "More bacon, obviously" },
      ],
    }),
    createTask("ON_DECK", "Polish the silver (mind the Sackville-Bagginses)", { dueInDays: 5 }),
    createTask("ON_DECK", "Repaint the round green door"),
    createTask("IN_PROGRESS", "Plan my eleventy-first birthday party", {
      description: "A long-expected party — and a rather dramatic exit.",
      dueInDays: 7,
      subtasks: [
        { title: "Invitations to every Baggins and Took", isComplete: true },
        { title: "Order fireworks from Gandalf" },
        { title: "Rehearse the disappearing speech" },
      ],
    }),
    createTask("IN_PROGRESS", "Tend the tomato garden", {
      subtasks: [
        { title: "Water the beds", isComplete: true },
        { title: "Stake the vines" },
        { title: "Shoo the rabbits" },
      ],
    }),
    createTask("IN_PROGRESS", "Catalogue the wine cellar"),
    createTask("DONE", "Second breakfast", { completedDaysAgo: 1 }),
    createTask("DONE", "Air out the spare bedroom", { completedDaysAgo: 2 }),
    createTask("DONE", "Mend the garden fence", { completedDaysAgo: 4 }),
    createTask("DONE", "Pay the Gaffer for the week", { completedDaysAgo: 3 }),
    createTask("ARCHIVED", "Last year's Yule feast", { archivedDaysAgo: 40 }),
    createTask("ARCHIVED", "Spring cleaning, 1389", { archivedDaysAgo: 60 }),
  ],
};

const theAdventureBoard: DemoBoardSeed = {
  slug: "the-adventure",
  noteLines: [
    "Stick to the path.",
    "Never laugh at live dragons.",
    "Keep it secret, keep it safe.",
    "Home is worth the long road.",
  ],
  tasks: [
    createTask("ICE_BOX", "Find a use for the troll-hoard gold"),
    createTask("ICE_BOX", "Learn what 'Sting' is worth in a fight"),
    createTask("ICE_BOX", "Decipher the dwarvish moon-runes"),
    createTask("ON_DECK", "Reach the Lonely Mountain by Durin's Day", {
      dueInDays: 6,
      subtasks: [
        { title: "Read the moon-runes", isComplete: true },
        { title: "Find the hidden door" },
        { title: "Wait for the thrush to knock" },
      ],
    }),
    createTask("ON_DECK", "Resupply at Lake-town", {
      dueInDays: 3,
      subtasks: [
        { title: "Dry off the dwarves" },
        { title: "New cloaks and provisions" },
      ],
    }),
    createTask("ON_DECK", "Cross Mirkwood without leaving the path", { dueInDays: 4 }),
    createTask("IN_PROGRESS", "Burgle the Arkenstone from Smaug", {
      description: "Tread softly. Dragons keep careful count of their treasure.",
      dueInDays: 5,
      subtasks: [
        { title: "Sneak down the long tunnel", isComplete: true },
        { title: "Flatter the dragon (carefully)" },
        { title: "Spot the bare patch on his hide" },
        { title: "Do NOT wake him fully" },
      ],
    }),
    createTask("IN_PROGRESS", "Keep thirteen dwarves out of trouble", {
      subtasks: [
        { title: "Free them from the spiders", isComplete: true },
        { title: "Free them from the Elvenking" },
        { title: "Float them out in barrels" },
      ],
    }),
    createTask("IN_PROGRESS", "Keep the ring quiet for now"),
    createTask("DONE", "Win the riddle-game in the dark", {
      completedDaysAgo: 5,
      subtasks: [
        { title: "Answer Gollum's riddles", isComplete: true },
        { title: "Find the way out", isComplete: true },
      ],
    }),
    createTask("DONE", "Escape the goblin tunnels", { completedDaysAgo: 6 }),
    createTask("DONE", "Outwit the trolls until sunrise", { completedDaysAgo: 8 }),
    createTask("DONE", "Sign Thorin & Co.'s contract", { completedDaysAgo: 11 }),
    createTask("ARCHIVED", "The unexpected party (and all those dishes)", { archivedDaysAgo: 30 }),
    createTask("ARCHIVED", "Ran out the door without a handkerchief", { archivedDaysAgo: 28 }),
  ],
};

const thereAndBackAgainBoard: DemoBoardSeed = {
  slug: "there-and-back-again",
  noteLines: [
    "Begin at the beginning.",
    "Tell it true (mostly).",
    "Leave room for the songs.",
    "A tale grows in the telling.",
  ],
  tasks: [
    createTask("ICE_BOX", "Settle on a title (There and Back Again?)"),
    createTask("ICE_BOX", "Translate the Elvish songs for the appendix"),
    createTask("ICE_BOX", "Sketch a map of Wilderland for the endpapers"),
    createTask("ON_DECK", "Draft the Rivendell chapter", {
      dueInDays: 4,
      subtasks: [
        { title: "Elrond's counsel" },
        { title: "Reading the map by moonlight" },
      ],
    }),
    createTask("ON_DECK", "Interview Balin for the dwarves' side of the story"),
    createTask("ON_DECK", "Decide how much to tell about the ring", { dueInDays: 2 }),
    createTask("IN_PROGRESS", "Write the Smaug chapter", {
      description: "The conversation with the dragon — every riddling word of it.",
      dueInDays: 3,
      subtasks: [
        { title: "The talk with the dragon", isComplete: true },
        { title: "The weak spot in his hide" },
        { title: "The fall of Lake-town" },
      ],
    }),
    createTask("IN_PROGRESS", "Revise 'Riddles in the Dark'", {
      subtasks: [
        { title: "Tell it honestly this time", isComplete: true },
        { title: "Describe Gollum fairly" },
      ],
    }),
    createTask("IN_PROGRESS", "Compile the songs and verses"),
    createTask("DONE", "Write the opening line", {
      description: "In a hole in the ground there lived a hobbit.",
      completedDaysAgo: 6,
    }),
    createTask("DONE", "Finish 'An Unexpected Party'", { completedDaysAgo: 2 }),
    createTask("DONE", "Leave the book to Frodo", { completedDaysAgo: 1 }),
    createTask("ARCHIVED", "The soggy first draft", { archivedDaysAgo: 35 }),
    createTask("ARCHIVED", "The preface nobody needed", { archivedDaysAgo: 50 }),
  ],
};

export const demoBoardSeeds = [bagEndBoard, theAdventureBoard, thereAndBackAgainBoard];

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
