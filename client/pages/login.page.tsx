import { Center, TextInput, PasswordInput, Group, Checkbox, Anchor, Space, Button, Text } from "@mantine/core";
import { useForm } from "@mantine/form";

Page.metaData = {
  title: 'Welcome back!',
  description: "The brave new whirled..."
}

export function Page() {
  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      rememberMe: false,
    },

    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
    },
  });

  return (
    <Center className="flex flex-col w-full h-full">
      <Text size="xl">Hello, Whirled!</Text>
      <Text size="xs">Welcome back to the brave new whirled!</Text>

      <form className="flex flex-col gap-2 w-72" onSubmit={form.onSubmit((values) => console.log(values.email, values.password))}>
        <Text size="sm">Email</Text>
        <TextInput required placeholder="your@email.com"
          {...form.getInputProps('email')}
        />

        <Text size="sm">Password</Text>
        <PasswordInput required placeholder="Your password"
          {...form.getInputProps('password')}
        />

        <Group position="apart">
          <Checkbox label="Remember me" />
          <Anchor
            onClick={(event: { preventDefault: () => void; }) => event.preventDefault()}
            href="#"
            size="sm"
          >
            Forgot your password?
          </Anchor>
        </Group>

        <Group position="center">
          <Space />
          <Button fullWidth type="submit">Login</Button>
        </Group>
        <Group position="center" className="text-sm">
          {"Don't have an account?"}
          <Anchor href="/signup">Sign Up</Anchor>
        </Group>
      </form>
    </Center>
  );
}