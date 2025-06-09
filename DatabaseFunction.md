-- DROP FUNCTION public.bulk_insert_teachers(jsonb, int4);

CREATE OR REPLACE FUNCTION public.bulk_insert_teachers(p_teachers_data jsonb, p_created_by integer)
 RETURNS TABLE(success_count integer, error_count integer, error_details text[], created_users jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    teacher_record JSONB;
    new_user_id INTEGER;
    success_cnt INTEGER := 0;
    error_cnt INTEGER := 0;
    errors TEXT[] := '{}';
    created_users_list JSONB := '[]'::jsonb;
BEGIN
    FOR teacher_record IN SELECT * FROM jsonb_array_elements(p_teachers_data)
    LOOP
        BEGIN
            -- Insert user
            INSERT INTO app_user (email, password, user_name, nama_lengkap, is_active, created_by)
            VALUES (
                teacher_record->>'email',
                teacher_record->>'hashed_password',
                teacher_record->>'user_name',
                teacher_record->>'nama_lengkap',
                TRUE,
                p_created_by
            ) RETURNING id INTO new_user_id;
            
            -- Insert profile
            INSERT INTO user_profile (user_id, tmp_lahir, tgl_lahir, gender, telepon, alamat, agama, created_by)
            VALUES (
                new_user_id,
                teacher_record->>'tmp_lahir',
                (teacher_record->>'tgl_lahir')::DATE,
                teacher_record->>'gender',
                teacher_record->>'telepon',
                teacher_record->>'alamat',
                teacher_record->>'agama',
                p_created_by
            );
            
            -- Insert teacher details
            INSERT INTO teacher_details (user_id, kode_guru, niy, created_by)
            VALUES (
                new_user_id,
                teacher_record->>'kode_guru',
                teacher_record->>'niy',
                p_created_by
            );
            
            -- Insert role (Teacher = role_id 2)
            INSERT INTO app_user_role (role_id, user_id, is_active, created_by)
            VALUES (2, new_user_id, TRUE, p_created_by);
            
            -- Track created user
            created_users_list := created_users_list || jsonb_build_object(
                'user_id', new_user_id,
                'email', teacher_record->>'email',
                'user_name', teacher_record->>'user_name',
                'nama_lengkap', teacher_record->>'nama_lengkap'
            );
            
            success_cnt := success_cnt + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_cnt := error_cnt + 1;
                errors := array_append(errors, 
                    'Error untuk ' || (teacher_record->>'email') || ': ' || SQLERRM);
        END;
    END LOOP;
    
    RETURN QUERY SELECT success_cnt, error_cnt, errors, created_users_list;
END;
$function$
;




-- DROP FUNCTION public.bulk_insert_students(jsonb, int4);

CREATE OR REPLACE FUNCTION public.bulk_insert_students(p_students_data jsonb, p_created_by integer)
 RETURNS TABLE(success_count integer, error_count integer, error_details text[], created_users jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    student_record JSONB;
    new_user_id INTEGER;
    success_cnt INTEGER := 0;
    error_cnt INTEGER := 0;
    errors TEXT[] := '{}';
    created_users_list JSONB := '[]'::jsonb;
BEGIN
    FOR student_record IN SELECT * FROM jsonb_array_elements(p_students_data)
    LOOP
        BEGIN
            -- Insert user
            INSERT INTO app_user (email, password, user_name, nama_lengkap, is_active, created_by)
            VALUES (
                student_record->>'email',
                student_record->>'hashed_password',
                student_record->>'user_name',
                student_record->>'nama_lengkap',
                TRUE,
                p_created_by
            ) RETURNING id INTO new_user_id;
            
            -- Insert profile
            INSERT INTO user_profile (user_id, tmp_lahir, tgl_lahir, gender, telepon, alamat, agama, created_by)
            VALUES (
                new_user_id,
                student_record->>'tmp_lahir',
                (student_record->>'tgl_lahir')::DATE,
                student_record->>'gender',
                student_record->>'telepon',
                student_record->>'alamat',
                student_record->>'agama',
                p_created_by
            );
            
            -- Insert student details
            INSERT INTO student_details (user_id, nis, nisn, parent_contact, created_by)
            VALUES (
                new_user_id,
                student_record->>'nis',
                student_record->>'nisn',
                student_record->>'parent_contact',
                p_created_by
            );
            
            -- Insert role (Student = role_id 3)
            INSERT INTO app_user_role (role_id, user_id, is_active, created_by)
            VALUES (3, new_user_id, TRUE, p_created_by);
            
            -- Track created user
            created_users_list := created_users_list || jsonb_build_object(
                'user_id', new_user_id,
                'email', student_record->>'email',
                'user_name', student_record->>'user_name',
                'nama_lengkap', student_record->>'nama_lengkap'
            );
            
            success_cnt := success_cnt + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_cnt := error_cnt + 1;
                errors := array_append(errors, 
                    'Error untuk ' || (student_record->>'email') || ': ' || SQLERRM);
        END;
    END LOOP;
    
    RETURN QUERY SELECT success_cnt, error_cnt, errors, created_users_list;
END;
$function$
;





-- DROP FUNCTION public.bulk_insert_admins(jsonb, int4);

CREATE OR REPLACE FUNCTION public.bulk_insert_admins(p_admins_data jsonb, p_created_by integer)
 RETURNS TABLE(success_count integer, error_count integer, error_details text[], created_users jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    admin_record JSONB;
    new_user_id INTEGER;
    success_cnt INTEGER := 0;
    error_cnt INTEGER := 0;
    errors TEXT[] := '{}';
    created_users_list JSONB := '[]'::jsonb;
BEGIN
    FOR admin_record IN SELECT * FROM jsonb_array_elements(p_admins_data)
    LOOP
        BEGIN
            -- Insert user
            INSERT INTO app_user (email, password, user_name, nama_lengkap, is_active, created_by)
            VALUES (
                admin_record->>'email',
                admin_record->>'hashed_password',
                admin_record->>'user_name',
                admin_record->>'nama_lengkap',
                TRUE,
                p_created_by
            ) RETURNING id INTO new_user_id;
            
            -- Insert profile
            INSERT INTO user_profile (user_id, tmp_lahir, tgl_lahir, gender, telepon, alamat, agama, created_by)
            VALUES (
                new_user_id,
                admin_record->>'tmp_lahir',
                (admin_record->>'tgl_lahir')::DATE,
                admin_record->>'gender',
                admin_record->>'telepon',
                admin_record->>'alamat',
                admin_record->>'agama',
                p_created_by
            );
            
            -- Insert admin details
            INSERT INTO admin_details (user_id, kode_admin, nip, created_by)
            VALUES (
                new_user_id,
                admin_record->>'kode_admin',
                admin_record->>'nip',
                p_created_by
            );
            
            -- Insert role (Admin = role_id 1)
            INSERT INTO app_user_role (role_id, user_id, is_active, created_by)
            VALUES (1, new_user_id, TRUE, p_created_by);
            
            -- Track created user
            created_users_list := created_users_list || jsonb_build_object(
                'user_id', new_user_id,
                'email', admin_record->>'email',
                'user_name', admin_record->>'user_name',
                'nama_lengkap', admin_record->>'nama_lengkap'
            );
            
            success_cnt := success_cnt + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_cnt := error_cnt + 1;
                errors := array_append(errors, 
                    'Error untuk ' || (admin_record->>'email') || ': ' || SQLERRM);
        END;
    END LOOP;
    
    RETURN QUERY SELECT success_cnt, error_cnt, errors, created_users_list;
END;
$function$
;
