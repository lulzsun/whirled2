import { ActionIcon, Box } from "@mantine/core";
import { IconArrowBackUp, IconX } from "@tabler/icons-react";
import { navigate } from 'vite-plugin-ssr/client/router';

export default function TitleBar() {
  return (
    <Box className="flex" sx={(theme) => ({
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0]})}
    >
      <div className="flex flex-row w-full">
        <ActionIcon variant="filled" onClick={() => history.go(-1)}>
          <IconArrowBackUp size={18} />
        </ActionIcon>
        <div className="w-full"></div>
        <ActionIcon variant="filled" onClick={() => navigate('/')}>
          <IconX size={18} />
        </ActionIcon>
      </div>
    </Box>
  );
}