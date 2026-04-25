import { TaskStatus as PrismaTaskStatus, ThemePreference as PrismaThemePreference } from "@prisma/client";
import { hash } from "bcryptjs";
import { addDays, subDays } from "date-fns";

import { hydrateDatabaseUrlEnv } from "../src/lib/database-url";
import { prisma } from "../src/lib/db";
import { demoBoardSeeds, expandDemoSeed } from "../src/lib/demo-data";
import { demoUser } from "../src/lib/domain";
import { loadProjectEnv } from "../src/lib/load-env";

loadProjectEnv();
hydrateDatabaseUrlEnv({ preferDirectConnection: true });

async function seed() {
  const passwordHash = await hash(demoUser.password, 12);

  const user = await prisma.user.upsert({
    where: {
      email: demoUser.email,
    },
    update: {},
    create: {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      passwordHash,
      avatarLabel: demoUser.avatarLabel,
      themePreference: demoUser.themePreference.toUpperCase() as PrismaThemePreference,
    },
  });

  for (const board of expandDemoSeed()) {
    const boardRecord = await prisma.board.upsert({
      where: {
        userId_slug: {
          userId: user.id,
          slug: board.slug,
        },
      },
      update: {},
      create: {
        id: board.id,
        userId: user.id,
        name: board.name,
        slug: board.slug,
        description: board.description,
        iconKey: board.iconKey,
        sortOrder: board.sortOrder,
      },
    });

    const existingNote = await prisma.boardNote.findUnique({
      where: {
        boardId: boardRecord.id,
      },
    });

    if (!existingNote) {
      await prisma.boardNote.create({
        data: {
          id: `note_${boardRecord.id}`,
          boardId: boardRecord.id,
          content: board.noteContent,
        },
      });
    }

    for (const task of board.tasks) {
      const existingTask = await prisma.task.findUnique({
        where: {
          id: task.id,
        },
      });

      if (existingTask) {
        continue;
      }

      await prisma.task.create({
        data: {
          id: task.id,
          boardId: boardRecord.id,
          title: task.title,
          description: task.description,
          status: task.status as PrismaTaskStatus,
          sortOrder: task.sortOrder,
          dueDate: task.dueInDays ? addDays(new Date(), task.dueInDays) : null,
          completedAt: task.completedDaysAgo ? subDays(new Date(), task.completedDaysAgo) : null,
          archivedAt: task.archivedDaysAgo ? subDays(new Date(), task.archivedDaysAgo) : null,
          subtasks: {
            create: task.subtasks.map((subtask) => ({
              id: subtask.id,
              title: subtask.title,
              isComplete: subtask.isComplete,
              sortOrder: subtask.sortOrder,
            })),
          },
        },
      });
    }
  }

  console.log(`Seeded ${demoBoardSeeds.length} boards for ${user.email}.`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
