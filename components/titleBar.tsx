import { ActionIcon, Box } from "@mantine/core";
import { IconArrowBackUp, IconX } from "@tabler/icons-react";
import { useRouter } from "next/router";

export default function TitleBar() {
  const router = useRouter();
  
  return (
    <Box className="flex" sx={(theme) => ({
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0]})}
    >
      <div className="flex flex-row w-full">
        <ActionIcon variant="filled" onClick={() => router.back()}>
          <IconArrowBackUp size={18} />
        </ActionIcon>
        <div className="w-full"></div>
        <ActionIcon variant="filled" onClick={() => router.push('/')}>
          <IconX size={18} />
        </ActionIcon>
      </div>
    </Box>
  );
}