"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../src/studio/auth");
const WORKSPACE_BOOTSTRAP = [
    {
        slug: "tecnoria",
        users: [
            {
                email: "qa.admin.auctorio.tecnoria@tecnoriasl.com",
                displayName: "QA Admin Auctorio Tecnoria",
                roleKeys: ["admin"],
            },
            {
                email: "qa.editor.auctorio.tecnoria@tecnoriasl.com",
                displayName: "QA Editor Auctorio Tecnoria",
                roleKeys: ["editor"],
            },
        ],
    },
    {
        slug: "guiaprogramaciontv",
        users: [
            {
                email: "qa.admin.auctorio.guiatv@tecnoriasl.com",
                displayName: "QA Admin Auctorio GuiaTV",
                roleKeys: ["admin"],
            },
            {
                email: "qa.editor.auctorio.guiatv@tecnoriasl.com",
                displayName: "QA Editor Auctorio GuiaTV",
                roleKeys: ["editor"],
            },
        ],
    },
    {
        slug: "talkaris",
        users: [
            {
                email: "qa.admin.auctorio.talkaris@tecnoriasl.com",
                displayName: "QA Admin Auctorio Talkaris",
                roleKeys: ["admin"],
            },
            {
                email: "qa.editor.auctorio.talkaris@tecnoriasl.com",
                displayName: "QA Editor Auctorio Talkaris",
                roleKeys: ["editor"],
            },
        ],
    },
];
async function main() {
    for (const workspace of WORKSPACE_BOOTSTRAP) {
        const tenant = await (0, auth_1.resolveTenantBySlug)(workspace.slug);
        if (!tenant) {
            console.warn(`[bootstrap] workspace not found: ${workspace.slug}`);
            continue;
        }
        console.log(`[bootstrap] ${tenant.slug} (${tenant.id})`);
        for (const user of workspace.users) {
            const invitation = await (0, auth_1.inviteStudioUser)(tenant.id, null, {
                email: user.email,
                displayName: user.displayName,
                roleKeys: [...user.roleKeys],
            });
            console.log(`  invited ${invitation.email} -> ${workspace.slug} (${user.roleKeys.join(",")})`);
        }
    }
}
void main().catch((error) => {
    console.error("[bootstrap] failed", error);
    process.exitCode = 1;
});
