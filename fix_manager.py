import re

with open('src/app/manager/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken team section: replace `) : (\n\n>>>>>>> 8d0b229 ...` 
# with the proper TeamModule JSX plus closing tags
old = "                    ) : (\r\n\r\n>>>>>>> 8d0b229 (Final client delivery)\r\n"
new = (
    "                    ) : (\r\n"
    "                      <TeamModule employees={employees} onManageRoles={() => setShowRolesModal(true)} onToggleStatus={toggleStatus} />\r\n"
    "                    )}\r\n"
    "                 </motion.div>\r\n"
    "               )}\r\n\r\n"
)

if old in content:
    content = content.replace(old, new)
    print("Fixed team section successfully")
else:
    # Try without carriage returns
    old2 = "                    ) : (\n\n>>>>>>> 8d0b229 (Final client delivery)\n"
    new2 = (
        "                    ) : (\n"
        "                      <TeamModule employees={employees} onManageRoles={() => setShowRolesModal(true)} onToggleStatus={toggleStatus} />\n"
        "                    )}\n"
        "                 </motion.div>\n"
        "               )}\n\n"
    )
    if old2 in content:
        content = content.replace(old2, new2)
        print("Fixed team section (LF variant)")
    else:
        print("Pattern not found, searching nearby...")
        idx = content.find(">>>>>>> 8d0b229 (Final client delivery)")
        if idx >= 0:
            print(f"Conflict marker found at position {idx}")
            print(repr(content[max(0,idx-200):idx+50]))
        else:
            print("No conflict marker found at all")

with open('src/app/manager/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
