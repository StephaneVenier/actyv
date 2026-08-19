begin;

insert into public.mastery_exercise_links (
  mastery_id,
  exercise_id,
  exercise_key,
  exercise_name,
  source_type
)
values
  (
    '84886d1e-b93d-4fcc-a9df-e60b15d1744b',
    'f4081e83-544b-44e1-ba1f-3b68b787a5aa',
    'assault-bike',
    'Assault bike',
    'exercise_library'
  ),
  (
    'f8fa75b4-88c9-4130-814a-0bbeae8d90d5',
    '66a65d06-ca59-459c-b56a-901a3c0ab652',
    'papillon',
    'Papillon',
    'exercise_library'
  )
on conflict (source_type, exercise_name) do update
set
  mastery_id = excluded.mastery_id,
  exercise_id = excluded.exercise_id,
  exercise_key = excluded.exercise_key;

notify pgrst, 'reload schema';

commit;
