import { ActionIcon, Textarea } from '@mantine/core';
import { IconDots, IconSend } from '@tabler/icons';
import { useState } from 'react';

type Props = {
  id?: string;
}

export default function CommentEditor({id}: Props) {
  const [value, onChange] = useState('');
  return <div className='flex flex-row space-x-2'>
    <Textarea value={value} onChange={(event) => onChange(event.currentTarget.value)}
      className='grow'
      placeholder="Post a comment!"
      autosize
      minRows={2}
      maxRows={4}
      variant="filled"
    >
    </Textarea>
    <div className='flex flex-col justify-between'>
      <ActionIcon variant="filled" color="blue"><IconSend size={16}/></ActionIcon>
      <ActionIcon variant="subtle" color="blue"><IconDots size={16}/></ActionIcon>
    </div>
  </div>;
}